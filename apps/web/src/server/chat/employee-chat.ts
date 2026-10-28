import { handleEmployeeMessage, type TurnDeps } from "../agent/run-turn";
import type { Session } from "../auth/session";
import type { Conversation, DraftTicket, Message, Step } from "../conversations/types";
import { toTicketSummary } from "../service-desk";
import { TicketsError, type Actor } from "../tickets/client";
import { PRIORITY_LABEL, type Employee } from "../tickets/schemas";

/**
 * Casos de uso da tela do funcionário. As rotas de API só fazem HTTP
 * (ler corpo, devolver JSON); a lógica fica aqui, testável sem Next.js.
 *
 * Toda função recebe a SESSÃO, nunca um e-mail vindo do navegador.
 */

export type ChatSnapshot = { employee: Employee; conversation: Conversation; messages: Message[] };

export type ChatDeps = TurnDeps;

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const actorOf = (session: Session): Actor => ({ email: session.email, role: "employee" });

/** Perfil do funcionário em memória por alguns minutos: poupa o legado instável a cada mensagem. */
const profileCache = new Map<string, { employee: Employee; until: number }>();
const PROFILE_TTL_MS = 5 * 60_000;

async function employeeOf(deps: ChatDeps, session: Session): Promise<Employee> {
  const cached = profileCache.get(session.email);
  if (cached && cached.until > Date.now()) return cached.employee;
  try {
    const employee = await deps.tickets.getEmployee(actorOf(session), session.email);
    profileCache.set(session.email, { employee, until: Date.now() + PROFILE_TTL_MS });
    return employee;
  } catch (err) {
    if (err instanceof TicketsError && err.kind === "unavailable") {
      throw new ChatError(503, "O sistema de chamados está instável agora. Tente de novo em instantes.");
    }
    throw err;
  }
}

/** Abre a conversa em andamento (ou começa uma) — é o "voltar outro dia e continuar". */
export async function loadChat(deps: ChatDeps, session: Session): Promise<ChatSnapshot> {
  const employee = await employeeOf(deps, session);
  const conversation =
    (await deps.store.findActiveForEmployee(session.email)) ?? (await deps.store.create({ email: session.email, name: employee.name }));
  const messages = await deps.store.listMessages(conversation.id);
  return { employee, conversation, messages };
}

async function ownConversation(deps: ChatDeps, session: Session, conversationId: string): Promise<Conversation> {
  const conversation = await deps.store.get(conversationId);
  // Conversa de outra pessoa responde igual a inexistente.
  if (!conversation || conversation.employeeEmail !== session.email) throw new ChatError(404, "Conversa não encontrada.");
  if (conversation.status === "encerrada") throw new ChatError(409, "Esta conversa foi encerrada. Comece uma nova.");
  return conversation;
}

export async function sendMessage(
  deps: ChatDeps,
  session: Session,
  input: { conversationId: string; text: string },
): Promise<{ conversation: Conversation; messages: Message[]; kind: string }> {
  const conversation = await ownConversation(deps, session, input.conversationId);
  const employee = await employeeOf(deps, session);
  const result = await handleEmployeeMessage(deps, { conversation, employee, text: input.text });
  return { conversation: result.conversation, messages: result.messages, kind: result.kind };
}

export type DraftEdits = Partial<Pick<DraftTicket, "title" | "description" | "category" | "impact" | "blocking" | "deadlineToday">>;

/**
 * Botões do cartão de rascunho. Confirmar e cancelar não passam pelo modelo:
 * são ações determinísticas, com a resposta montada pelo código.
 */
export async function pendingAction(
  deps: ChatDeps,
  session: Session,
  input: { conversationId: string; pendingId: string; action: "confirm" | "cancel" | "edit"; edits?: DraftEdits },
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const conversation = await ownConversation(deps, session, input.conversationId);
  if (conversation.pendingAction?.id !== input.pendingId) {
    throw new ChatError(409, "Este rascunho não está mais pendente.");
  }
  const pending = conversation.pendingAction;

  if (input.action === "edit") {
    if (!input.edits) throw new ChatError(400, "Nada para editar.");
    const updated = await deps.desk.editDraft(actorOf(session), conversation, input.edits);
    return { conversation: updated, messages: [] };
  }

  if (input.action === "cancel") {
    await deps.desk.cancelPending(conversation);
    const msg = await deps.store.appendMessage(conversation.id, {
      role: "agent",
      authorName: "Nexo Assist",
      content: "Tudo bem, descartei o rascunho. Se quiser, me conte de novo o que precisa.",
      meta: {
        steps: [{ tool: "cancelar_acao_pendente", label: "descartou o rascunho", ok: true, input: { rascunhoId: pending.id }, output: null }],
        decision: {
          intent: "confirmar_acao",
          action: "Descartou o rascunho a seu pedido",
          confidence: 1,
          reason: `Você cancelou o rascunho ${pending.id}.`,
          rules: [],
          guardrails: [],
        },
      },
    });
    return { conversation: await deps.store.require(conversation.id), messages: [msg] };
  }

  try {
    const outcome = await deps.desk.confirmPending(actorOf(session), conversation, pending.id);
    const label = { criado: `criou o chamado ${outcome.ticket.number}`, atualizado: `atualizou o ${outcome.ticket.number}`, reaberto: `reabriu o ${outcome.ticket.number}` }[outcome.kind];
    const steps: Step[] = [{ tool: "confirmar_acao_pendente", label, ok: true, input: { rascunhoId: pending.id }, output: outcome.summary }];
    const rules = [`Confirmação: ${pending.kind === "create" ? "o chamado foi criado" : "a atualização foi aplicada"} só depois que você confirmou o rascunho ${pending.id}.`];
    let content = `Pronto: ${outcome.summary.charAt(0).toLowerCase()}${outcome.summary.slice(1)}`;
    if (outcome.autoTransfer) {
      steps.push({ tool: "transferir_para_analista", label: "chamou um analista", ok: true, input: { motivo: "chamado_critico" }, output: outcome.autoTransfer.contactEstimate });
      rules.push("Transferência: chamados críticos vão direto para um analista.");
      content += ` Como é crítico, já chamei um analista: ele continua a conversa aqui, ${outcome.autoTransfer.contactEstimate}.`;
    }
    const msg = await deps.store.appendMessage(conversation.id, {
      role: "agent",
      authorName: "Nexo Assist",
      content,
      meta: {
        steps,
        decision: {
          intent: "confirmar_acao",
          action: `${label.charAt(0).toUpperCase()}${label.slice(1)} após sua confirmação`,
          confidence: 1,
          reason: `Você confirmou o rascunho ${pending.id}, com prioridade ${PRIORITY_LABEL[outcome.ticket.priority].toLowerCase()}.`,
          rules,
          guardrails: [],
        },
        cards: [{ kind: "ticket", ticket: toTicketSummary(outcome.ticket) }],
      },
    });
    return { conversation: await deps.store.require(conversation.id), messages: [msg] };
  } catch (err) {
    if (err instanceof TicketsError && err.kind === "unavailable") {
      throw new ChatError(503, "O sistema de chamados está instável agora. Seu rascunho continua salvo: confirme de novo em instantes.");
    }
    if (err instanceof TicketsError) throw new ChatError(409, err.message);
    throw err;
  }
}

/** Começa uma conversa nova (a anterior é encerrada). Não vale se um analista estiver atendendo. */
export async function startNewConversation(deps: ChatDeps, session: Session, currentId: string): Promise<ChatSnapshot> {
  const current = await deps.store.get(currentId);
  if (current && current.employeeEmail === session.email && current.status !== "encerrada") {
    if (current.status !== "agent") throw new ChatError(409, "Um analista está com esta conversa. Aguarde o encerramento.");
    await deps.store.update(current.id, { status: "encerrada", pendingAction: null });
  }
  return loadChat(deps, session);
}
