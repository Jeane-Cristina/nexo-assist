import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../src/server/auth/session";
import {
  closeConversation,
  getConversationDetail,
  listConversations,
  returnToAgent,
  sendAnalystMessage,
  takeOver,
} from "../src/server/chat/analyst-console";
import { loadChat, sendMessage } from "../src/server/chat/employee-chat";
import { ANA, createTestEnv, decision, scriptedModel, type TestEnv } from "./helpers";

/** Console do analista: fila, assumir com o agent pausado, devolver e encerrar. */

const ana: Session = { email: ANA.email, name: ANA.name, role: "employee", exp: 9_999_999_999 };
const rafael: Session = { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", department: "Suporte N2", exp: 9_999_999_999 };
const juliana: Session = { email: "juliana.costa@nexo.com.br", name: "Juliana Costa", role: "analyst", department: "Suporte N1", exp: 9_999_999_999 };

let env: TestEnv;
const noModel = () => env.deps(scriptedModel([]).model);

beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(() => env.cleanup());

/** Ana consulta o INC-20311 e pede um analista (o modelo é roteirizado). */
async function anaTransfers() {
  const { conversation } = await loadChat(noModel(), ana);
  await sendMessage(
    env.deps(scriptedModel([[{ tool: "consultar_chamado", args: { numero: "INC-20311" } }], [decision("consultar_chamado", 0.95)], "Está vencido."]).model),
    ana,
    { conversationId: conversation.id, text: "Como está o INC-20311?" },
  );
  const r = await sendMessage(
    env.deps(
      scriptedModel([
        [{ tool: "transferir_para_analista", args: { motivo: "pedido_do_funcionario", resumo: "Ana pediu analista: INC-20311 parado há 6 dias, acima do prazo." } }],
        [decision("falar_com_analista", 0.97)],
        "Encaminhei para um analista.",
      ]).model,
    ),
    ana,
    { conversationId: conversation.id, text: "Quero falar com um analista" },
  );
  return r.conversation;
}

describe("fila de conversas", () => {
  it("conversa transferida aparece em 'Para você', com contagens por filtro", async () => {
    const conv = await anaTransfers();
    const { items, counts } = await listConversations(noModel(), rafael, { filter: "para_voce" });
    expect(items.map((i) => i.conversation.id)).toEqual([conv.id]);
    expect(items[0]?.lastMessage?.content).toBe("Encaminhei para um analista.");
    expect(counts).toMatchObject({ para_voce: 1, com_agent: 0, minhas: 0, todas: 1 });
  });

  it("busca por nome ou número do chamado", async () => {
    await anaTransfers();
    expect((await listConversations(noModel(), rafael, { filter: "todas", query: "inc-20311" })).items).toHaveLength(1);
    expect((await listConversations(noModel(), rafael, { filter: "todas", query: "carla" })).items).toHaveLength(0);
  });

  it("detalhe traz o histórico e os chamados da funcionária", async () => {
    const conv = await anaTransfers();
    const d = await getConversationDetail(noModel(), rafael, conv.id);
    expect(d.messages.length).toBeGreaterThan(3);
    expect(d.employee?.department).toBe("Financeiro");
    expect(d.tickets?.map((t) => t.number)).toEqual(expect.arrayContaining(["INC-20311", "INC-20150"]));
    expect(d.conversation.transfer).toMatchObject({ reason: "pedido_do_funcionario", ticketNumber: "INC-20311" });
  });
});

describe("assumir o atendimento", () => {
  it("pausa o agent, registra na conversa e muda o status do chamado", async () => {
    const conv = await anaTransfers();
    const after = await takeOver(noModel(), rafael, conv.id);
    expect(after).toMatchObject({ status: "em_atendimento", assignedAnalyst: rafael.email });
    const msgs = await env.store.listMessages(conv.id);
    expect(msgs.at(-1)).toMatchObject({ role: "system", content: "Rafael Lima assumiu · agent pausado" });
    const ticket = await env.tickets.getTicket({ email: rafael.email, role: "analyst" }, "INC-20311");
    expect(ticket).toMatchObject({ status: "em_atendimento", assignee: rafael.email });
  });

  it("com o analista atendendo, a mensagem da funcionária NÃO chama o modelo", async () => {
    const conv = await anaTransfers();
    await takeOver(noModel(), rafael, conv.id);
    // roteiro vazio: se o modelo for chamado, o teste quebra
    const r = await sendMessage(noModel(), ana, { conversationId: conv.id, text: "Posso sim, está ligado." });
    expect(r.kind).toBe("paused");
  });

  it("só quem assumiu responde; outro analista não assume, não devolve e não encerra", async () => {
    const conv = await anaTransfers();
    await expect(sendAnalystMessage(noModel(), rafael, conv.id, "Oi")).rejects.toMatchObject({ status: 409 }); // ainda não assumiu
    await takeOver(noModel(), rafael, conv.id);
    const msg = await sendAnalystMessage(noModel(), rafael, conv.id, "Oi, Ana! Aqui é o Rafael.");
    expect(msg).toMatchObject({ role: "analyst", authorName: "Rafael Lima", meta: { authorTitle: "Suporte N2" } });
    for (const action of [takeOver, returnToAgent, closeConversation]) {
      await expect(action(noModel(), juliana, conv.id)).rejects.toMatchObject({ status: 409 });
    }
    await expect(sendAnalystMessage(noModel(), juliana, conv.id, "Oi")).rejects.toMatchObject({ status: 409 });
  });
});

describe("devolver e encerrar", () => {
  it("devolver ao agent: o agent volta a responder", async () => {
    const conv = await anaTransfers();
    await takeOver(noModel(), rafael, conv.id);
    const back = await returnToAgent(noModel(), rafael, conv.id);
    expect(back).toMatchObject({ status: "agent", assignedAnalyst: null, transfer: null });
    const r = await sendMessage(env.deps(scriptedModel([[decision("conversa", 0.9)], "De nada!"]).model), ana, { conversationId: conv.id, text: "Obrigada!" });
    expect(r.kind).toBe("answered");
    expect(r.messages.at(-1)?.content).toBe("De nada!");
  });

  it("encerrar fecha a conversa; a funcionária começa outra ao voltar", async () => {
    const conv = await anaTransfers();
    await takeOver(noModel(), rafael, conv.id);
    await closeConversation(noModel(), rafael, conv.id);
    expect((await env.store.require(conv.id)).status).toBe("encerrada");
    const again = await loadChat(noModel(), ana);
    expect(again.conversation.id).not.toBe(conv.id);
    // mas o polling da tela antiga ainda enxerga o encerramento
    const old = await loadChat(noModel(), ana, conv.id);
    expect(old.conversation.status).toBe("encerrada");
  });
});
