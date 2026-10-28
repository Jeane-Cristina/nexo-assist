import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { ConversationStore } from "../conversations/store";
import { MAX_EMPLOYEE_MESSAGES, type Conversation, type Message } from "../conversations/types";
import type { ServiceDesk } from "../service-desk";
import type { Actor, TicketsClient } from "../tickets/client";
import type { Employee } from "../tickets/schemas";
import { buildInstructions } from "./instructions";
import { TurnRecorder } from "./recorder";
import { createAgentTools } from "./tools";

/**
 * Um turno do atendimento: recebe a mensagem do funcionário e devolve as
 * mensagens que devem aparecer no chat.
 *
 * Ordem das barreiras (todas em código, antes ou depois do modelo):
 * 1. conversa transferida → o agent não responde;
 * 2. limite de 30 mensagens por sessão;
 * 3. o modelo decide e usa as ferramentas (que já aplicam privacidade, confirmação e prioridade);
 * 4. confiança baixa → transferência automática para um analista.
 */

export const LOW_CONFIDENCE = 0.45;
/** Quantas mensagens anteriores vão como contexto para o modelo. */
const HISTORY_WINDOW = 20;
const MAX_STEPS = 8;

export type TurnDeps = {
  model: MastraModelConfig;
  store: ConversationStore;
  desk: ServiceDesk;
  tickets: TicketsClient;
  clock: () => Date;
};

export type TurnResult =
  | { kind: "answered"; conversation: Conversation; messages: Message[] }
  /** Conversa com analista: a mensagem foi registrada, o agent não responde. */
  | { kind: "paused"; conversation: Conversation; messages: Message[] }
  | { kind: "limit_reached"; conversation: Conversation; messages: Message[] };

export async function handleEmployeeMessage(
  deps: TurnDeps,
  input: { conversation: Conversation; employee: Employee; text: string },
): Promise<TurnResult> {
  const { store } = deps;
  const actor: Actor = { email: input.employee.email, role: "employee" };
  let conversation = input.conversation;

  if (conversation.status === "aguardando_atendente" || conversation.status === "em_atendimento") {
    const msg = await store.appendMessage(conversation.id, { role: "employee", content: input.text });
    return { kind: "paused", conversation: await store.require(conversation.id), messages: [msg] };
  }

  if (conversation.employeeMessageCount >= MAX_EMPLOYEE_MESSAGES) {
    const notice = await store.appendMessage(conversation.id, {
      role: "system",
      content: `Esta sessão chegou ao limite de ${MAX_EMPLOYEE_MESSAGES} mensagens. Inicie uma nova conversa ou peça para falar com um analista.`,
    });
    return { kind: "limit_reached", conversation, messages: [notice] };
  }

  const employeeMsg = await store.appendMessage(conversation.id, { role: "employee", content: input.text });
  conversation = await store.require(conversation.id);

  const startedAt = deps.clock();
  const recorder = new TurnRecorder(conversation, startedAt);
  const history = await store.listMessages(conversation.id, { last: HISTORY_WINDOW });

  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: buildInstructions({ employee: input.employee, conversation, now: startedAt }),
    model: deps.model,
    tools: createAgentTools({ actor, employee: input.employee, tickets: deps.tickets, desk: deps.desk, recorder, clock: deps.clock }),
  });

  let text: string;
  try {
    const result = await agent.generate(toModelMessages(history), { maxSteps: MAX_STEPS });
    text = result.text.trim();
  } catch (err) {
    return answerWithError(deps, recorder, employeeMsg, err);
  }

  if (!recorder.decision) {
    recorder.guardrail("O agent não registrou a decisão neste turno; confiança marcada como não informada.");
  }

  // Barreira 4: sem segurança → analista. Vale mesmo que o modelo tenha "esquecido" de transferir.
  const confidence = recorder.decision?.confidence ?? null;
  const intent = recorder.decision?.intent;
  if (
    confidence !== null &&
    confidence < LOW_CONFIDENCE &&
    !recorder.transferred &&
    intent !== "fora_do_escopo" &&
    intent !== "conversa"
  ) {
    const outcome = await deps.desk.transfer(actor, recorder.conversation, {
      reason: "baixa_confianca",
      summary: `O agent não teve segurança para responder (confiança ${Math.round(confidence * 100)}%). Última mensagem: "${input.text}". ${recorder.decision?.reason ?? ""}`.trim(),
      confidence,
    });
    recorder.conversation = outcome.conversation;
    recorder.transferred = true;
    recorder.step("transferir_para_analista", "chamou um analista", true, { motivo: "baixa_confianca" }, outcome.contactEstimate);
    recorder.guardrail(`Transferido automaticamente: confiança ${Math.round(confidence * 100)}% abaixo de ${Math.round(LOW_CONFIDENCE * 100)}%.`);
    text = `${text ? `${text}\n\n` : ""}Não tenho segurança para resolver isso sozinho, então chamei um analista. Ele continua a conversa aqui, ${outcome.contactEstimate}.`;
  }

  if (!text) {
    text = recorder.transferred
      ? "Chamei um analista. Ele continua a conversa aqui."
      : "Desculpe, não consegui formular uma resposta. Pode me contar de outro jeito?";
    recorder.guardrail("O modelo não escreveu resposta; usei uma resposta padrão.");
  }

  const agentMsg = await store.appendMessage(conversation.id, {
    role: "agent",
    authorName: "Nexo Assist",
    content: text,
    meta: {
      steps: recorder.steps,
      decision: recorder.toDecision(),
      cards: recorder.finalCards(),
      quickReplies: recorder.transferred ? [] : (recorder.decision?.quickReplies ?? []),
    },
  });
  const finalConversation = await store.update(conversation.id, { lastConfidence: confidence });
  return { kind: "answered", conversation: finalConversation, messages: [employeeMsg, agentMsg] };
}

/** Histórico em formato de chat. Analista e eventos de sistema entram como contexto marcado. */
type ModelMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

export function toModelMessages(history: Message[]): ModelMessage[] {
  return history.map((m) => {
    switch (m.role) {
      case "employee":
        return { role: "user", content: m.content };
      case "agent":
        return { role: "assistant", content: m.content };
      case "analyst":
        return { role: "assistant", content: `[Analista ${m.authorName ?? ""} respondeu]: ${m.content}` };
      case "system":
        return { role: "assistant", content: `[Evento do sistema]: ${m.content}` };
    }
  });
}

async function answerWithError(deps: TurnDeps, recorder: TurnRecorder, employeeMsg: Message, err: unknown): Promise<TurnResult> {
  const message = err instanceof Error ? err.message : String(err);
  const rateLimited = /429|quota|rate.?limit|resource.?exhausted/i.test(message);
  console.error("[agent] falha ao gerar resposta:", message);
  recorder.guardrail(rateLimited ? "O provedor do modelo limitou as requisições (cota gratuita)." : "Falha ao chamar o modelo de IA.");
  const content = rateLimited
    ? "Estou recebendo muitas mensagens agora e preciso de alguns segundos. Pode enviar de novo daqui a pouco?"
    : "Tive um problema para processar sua mensagem. Pode tentar de novo? Se continuar, peça para falar com um analista.";
  const agentMsg = await deps.store.appendMessage(recorder.conversation.id, {
    role: "agent",
    authorName: "Nexo Assist",
    content,
    meta: { steps: recorder.steps, decision: { ...recorder.toDecision(), intent: "indefinida", action: "Não conseguiu responder" }, cards: [] },
  });
  return { kind: "answered", conversation: await deps.store.require(recorder.conversation.id), messages: [employeeMsg, agentMsg] };
}
