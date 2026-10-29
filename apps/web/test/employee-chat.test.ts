import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../src/server/auth/session";
import { ChatError, loadChat, pendingAction, sendMessage, startNewConversation } from "../src/server/chat/employee-chat";
import { ServiceDesk } from "../src/server/service-desk";
import { ANA, createTestEnv, decision, scriptedModel, type TestEnv } from "./helpers";

const anaSession: Session = { email: ANA.email, name: ANA.name, role: "employee", exp: 9_999_999_999 };
const carlaSession: Session = { email: "carla.mendes@nexo.com.br", name: "Carla Mendes", role: "employee", exp: 9_999_999_999 };

const VPN_DRAFT = {
  tipo: "INC",
  titulo: "VPN não conecta no notebook — erro 809",
  descricao: "Desde ontem o notebook com Windows 11 não conecta na VPN (erro 809).",
  categoria: "Rede e VPN",
  impacto: "individual",
  bloqueio: "atrapalha",
  compromissoHoje: true,
  ignorarPossiveisDuplicados: true,
};

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(() => env.cleanup());

async function withDraft() {
  const { conversation } = await loadChat(env.deps(scriptedModel([]).model), anaSession);
  const model = scriptedModel([[{ tool: "preparar_rascunho_chamado", args: VPN_DRAFT }], [decision("abrir_chamado", 0.9)], "Confira o rascunho."]).model;
  const result = await sendMessage(env.deps(model), anaSession, { conversationId: conversation.id, text: "VPN com erro 809, só eu, reunião hoje" });
  const pending = result.conversation.pendingAction!;
  return { conversation: result.conversation, pending, deps: env.deps(scriptedModel([]).model) };
}

describe("carregar o chat", () => {
  it("continua a conversa em andamento em vez de abrir outra", async () => {
    const deps = env.deps(scriptedModel([]).model);
    const first = await loadChat(deps, anaSession);
    const second = await loadChat(deps, anaSession);
    expect(second.conversation.id).toBe(first.conversation.id);
    expect(first.employee.device).toContain("Windows 11");
  });
});

describe("botões do rascunho", () => {
  it("Confirmar cria o chamado sem passar pelo modelo e responde com o cartão do chamado", async () => {
    const { conversation, pending, deps } = await withDraft();
    const { conversation: after, messages } = await pendingAction(deps, anaSession, {
      conversationId: conversation.id,
      pendingId: pending.id,
      action: "confirm",
    });
    expect(after.pendingAction).toBeNull();
    const msg = messages[0]!;
    expect(msg.content).toMatch(/^Pronto: abri o chamado INC-20413 com prioridade alta/);
    expect(msg.meta.cards?.[0]).toMatchObject({ kind: "ticket", ticket: { number: "INC-20413" } });
    expect(msg.meta.decision).toMatchObject({ intent: "confirmar_acao", confidence: 1 });
  });

  it("Editar recalcula prioridade e prazo no servidor", async () => {
    const { conversation, pending, deps } = await withDraft();
    const { conversation: after } = await pendingAction(deps, anaSession, {
      conversationId: conversation.id,
      pendingId: pending.id,
      action: "edit",
      edits: { deadlineToday: false, blocking: "atrapalha" },
    });
    const draft = after.pendingAction?.kind === "create" ? after.pendingAction.draft : null;
    expect(draft?.priority).toBe("media");
    expect(draft?.sla.label).toBe("3 dias úteis");
    expect(after.pendingAction?.id).toBe(pending.id);
  });

  it("Cancelar descarta e avisa", async () => {
    const { conversation, pending, deps } = await withDraft();
    const { conversation: after, messages } = await pendingAction(deps, anaSession, {
      conversationId: conversation.id,
      pendingId: pending.id,
      action: "cancel",
    });
    expect(after.pendingAction).toBeNull();
    expect(messages[0]?.content).toContain("descartei o rascunho");
  });

  it("rascunho antigo (id diferente) não é confirmado", async () => {
    const { conversation, deps } = await withDraft();
    await expect(
      pendingAction(deps, anaSession, { conversationId: conversation.id, pendingId: "D-000", action: "confirm" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("privacidade na API", () => {
  it("a Carla não consegue usar a conversa da Ana, nem sabendo o id", async () => {
    const { conversation, pending, deps } = await withDraft();
    const err = await pendingAction(deps, carlaSession, { conversationId: conversation.id, pendingId: pending.id, action: "confirm" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatError);
    expect((err as ChatError).status).toBe(404);
  });
});

describe("nova conversa", () => {
  it("encerra a atual e começa outra", async () => {
    const deps = env.deps(scriptedModel([]).model);
    const first = await loadChat(deps, anaSession);
    const next = await startNewConversation(deps, anaSession, first.conversation.id);
    expect(next.conversation.id).not.toBe(first.conversation.id);
    expect((await env.store.require(first.conversation.id)).status).toBe("encerrada");
  });

  it("não deixa trocar de conversa enquanto um analista atende", async () => {
    const deps = env.deps(scriptedModel([]).model);
    const first = await loadChat(deps, anaSession);
    await env.store.update(first.conversation.id, { status: "aguardando_atendente" });
    await expect(startNewConversation(deps, anaSession, first.conversation.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("legado fora do ar na confirmação", () => {
  it("responde 503 e mantém o rascunho salvo", async () => {
    const { conversation, pending } = await withDraft();
    const down = await createTestEnv({ legacyDown: true });
    try {
      const deps = { ...down.deps(scriptedModel([]).model), store: env.store, desk: new ServiceDesk(down.tickets, env.store) };
      const err = await pendingAction(deps, anaSession, { conversationId: conversation.id, pendingId: pending.id, action: "confirm" }).catch((e: unknown) => e);
      expect((err as ChatError).status).toBe(503);
      expect((await env.store.require(conversation.id)).pendingAction?.id).toBe(pending.id);
    } finally {
      down.cleanup();
    }
  });
});
