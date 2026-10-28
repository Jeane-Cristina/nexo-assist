import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleEmployeeMessage } from "../src/server/agent/run-turn";
import type { Conversation } from "../src/server/conversations/types";
import { ANA, createTestEnv, decision, scriptedModel, type ScriptStep, type TestEnv } from "./helpers";

/**
 * Testes do orquestrador com um modelo roteirizado. O roteiro faz o papel do
 * LLM; o que está sendo testado é tudo em volta dele: ferramentas, regras,
 * barreiras de segurança, persistência e transparência.
 */

let env: TestEnv;
let conversation: Conversation;

beforeEach(async () => {
  env = await createTestEnv();
  conversation = await env.store.create({ email: ANA.email, name: ANA.name });
});

afterEach(() => env.cleanup());

async function turn(text: string, script: ScriptStep[]) {
  const scripted = scriptedModel(script);
  const result = await handleEmployeeMessage(env.deps(scripted.model), { conversation, employee: ANA, text });
  conversation = result.conversation;
  // A resposta do agent (depois dela pode vir o marco "Transferida...").
  const agentMsg = [...result.messages].reverse().find((m) => m.role === "agent") ?? result.messages.at(-1)!;
  return { result, scripted, agentMsg };
}

const VPN_DRAFT = {
  tipo: "INC",
  titulo: "VPN não conecta no notebook — erro 809",
  descricao: "Desde ontem o notebook com Windows 11 não conecta na VPN (erro 809). Precisa para reunião às 14h.",
  categoria: "Rede e VPN",
  impacto: "individual",
  bloqueio: "atrapalha",
  compromissoHoje: true,
};

describe("transparência", () => {
  it("registra passos, decisão e confiança junto da resposta", async () => {
    const { agentMsg } = await turn("Meu notebook não conecta na VPN. Erro 809.", [
      [{ tool: "buscar_central_ajuda", args: { consulta: "VPN erro 809" } }],
      [decision("abrir_chamado", 0.9, { opcoesRapidas: ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"] })],
      "O artigo do erro 809 vale só para Windows 10 e o seu é Windows 11. Quem está sendo afetado?",
    ]);
    expect(agentMsg.role).toBe("agent");
    expect(agentMsg.meta.steps?.map((s) => s.label)).toEqual(["buscou na central de ajuda"]);
    expect(agentMsg.meta.steps?.[0]?.output).toEqual(expect.arrayContaining(["KB-001 · VPN com erro 809"]));
    expect(agentMsg.meta.decision).toMatchObject({ intent: "abrir_chamado", confidence: 0.9 });
    expect(agentMsg.meta.quickReplies).toEqual(["Só eu", "Minha equipe", "Toda a empresa", "Não sei"]);
    expect(conversation.lastConfidence).toBe(0.9);
  });

  it("o histórico da conversa vai como contexto para o modelo", async () => {
    await turn("Oi", [[decision("conversa", 0.95)], "Olá! Como posso ajudar?"]);
    const { scripted } = await turn("Preciso de ajuda com a VPN", [[decision("esclarecer", 0.8)], "Claro, o que acontece?"]);
    const prompt = JSON.stringify(scripted.prompts[0]);
    expect(prompt).toContain("Oi");
    expect(prompt).toContain("Olá! Como posso ajudar?");
    expect(prompt).toContain("Windows 11"); // equipamento no contexto
  });
});

describe("abertura de chamado com rascunho e confirmação", () => {
  it("monta o rascunho com prioridade calculada pelo código e só cria depois da confirmação", async () => {
    const first = await turn("Só eu. Tenho reunião com um cliente às 14h.", [
      [{ tool: "preparar_rascunho_chamado", args: { ...VPN_DRAFT, ignorarPossiveisDuplicados: false } }],
      [decision("abrir_chamado", 0.92)],
      "Coloquei prioridade alta por causa da reunião. Confira antes de eu criar:",
    ]);
    const pending = conversation.pendingAction;
    expect(pending?.kind).toBe("create");
    if (pending?.kind !== "create") throw new Error("esperava rascunho");
    expect(pending.draft.priority).toBe("alta");
    expect(pending.draft.sla.label).toBe("4 horas úteis");
    expect(first.agentMsg.meta.cards?.[0]).toMatchObject({ kind: "pending_action" });
    expect(first.agentMsg.meta.steps?.map((s) => s.label)).toEqual(
      expect.arrayContaining(["classificou a prioridade", "consultou o SLA", "montou o rascunho"]),
    );
    expect(first.agentMsg.meta.decision?.rules).toEqual(
      expect.arrayContaining(["Prioridade alta: Há um compromisso hoje que depende disso."]),
    );
    // Nada criado ainda
    const before = await env.tickets.listTickets({ email: ANA.email, role: "employee" }, { scope: "open" });
    expect(before.some((t) => t.title === VPN_DRAFT.titulo)).toBe(false);

    const second = await turn("Pode criar", [
      [{ tool: "confirmar_acao_pendente", args: { rascunhoId: pending.id } }],
      [decision("confirmar_acao", 0.97)],
      "Pronto: abri o chamado INC-20413.",
    ]);
    expect(conversation.pendingAction).toBeNull();
    expect(conversation.focusTicket).toBe("INC-20413");
    expect(second.agentMsg.meta.steps?.map((s) => s.label)).toContain("criou o chamado INC-20413");
    const after = await env.tickets.listTickets({ email: ANA.email, role: "employee" }, { scope: "open" });
    expect(after.filter((t) => t.title === VPN_DRAFT.titulo)).toHaveLength(1);
  });

  it("barreira: não deixa o modelo montar e confirmar o rascunho no mesmo turno", async () => {
    let draftId = "";
    const { agentMsg } = await turn("Abre um chamado da VPN pra mim, reunião às 14h", [
      [{ tool: "preparar_rascunho_chamado", args: { ...VPN_DRAFT, ignorarPossiveisDuplicados: true } }],
      async () => {
        draftId = (await env.store.require(conversation.id)).pendingAction?.id ?? "";
        return [{ tool: "confirmar_acao_pendente", args: { rascunhoId: draftId } }];
      },
      [decision("abrir_chamado", 0.9)],
      "Confira o rascunho.",
    ]);
    expect(agentMsg.meta.decision?.guardrails.join(" ")).toContain("mesmo turno");
    expect(conversation.pendingAction?.id).toBe(draftId);
    const open = await env.tickets.listTickets({ email: ANA.email, role: "employee" }, { scope: "open" });
    expect(open.some((t) => t.title === VPN_DRAFT.titulo)).toBe(false);
  });

  it("sem duplicidade: avisa quando já existe chamado aberto na mesma categoria", async () => {
    const { agentMsg } = await turn("Meu notebook está muito lento", [
      [
        {
          tool: "preparar_rascunho_chamado",
          args: { ...VPN_DRAFT, titulo: "Notebook lento", categoria: "Hardware", compromissoHoje: false, ignorarPossiveisDuplicados: false },
        },
      ],
      [decision("abrir_chamado", 0.8)],
      "Você já tem o INC-20311 sobre lentidão. É o mesmo problema?",
    ]);
    expect(conversation.pendingAction).toBeNull();
    expect(agentMsg.meta.decision?.rules.join(" ")).toContain("INC-20311");
  });

  it("chamado resolvido há 4 dias é reaberto, não duplicado", async () => {
    await turn("A senha do SAP bloqueou de novo", [
      [{ tool: "preparar_atualizacao", args: { numero: "INC-20150", mensagem: "O usuário do SAP foi bloqueado novamente." } }],
      [decision("atualizar_chamado", 0.88)],
      "Posso reabrir o INC-20150. Confirma?",
    ]);
    const pending = conversation.pendingAction;
    expect(pending).toMatchObject({ kind: "update", mode: "reabertura", ticketNumber: "INC-20150" });
    await turn("Confirmo", [[{ tool: "confirmar_acao_pendente", args: { rascunhoId: pending!.id } }], [decision("confirmar_acao", 0.95)], "Reabri o INC-20150."]);
    const t = await env.tickets.getTicket({ email: ANA.email, role: "employee" }, "INC-20150");
    expect(t.status).toBe("aguardando_analista");
  });

  it("caso crítico: depois de criar, transfere direto para um analista", async () => {
    const first = await turn("O sistema de faturamento parou para toda a equipe", [
      [
        {
          tool: "preparar_rascunho_chamado",
          args: { ...VPN_DRAFT, titulo: "Faturamento parado para a equipe", categoria: "Software", impacto: "equipe", bloqueio: "parado", compromissoHoje: false, ignorarPossiveisDuplicados: true },
        },
      ],
      [decision("abrir_chamado", 0.9)],
      "Prioridade crítica. Confirma?",
    ]);
    expect(first.result.conversation.pendingAction?.kind === "create" && first.result.conversation.pendingAction.draft.priority).toBe("critica");
    await turn("Sim", [
      [{ tool: "confirmar_acao_pendente", args: { rascunhoId: conversation.pendingAction!.id } }],
      [decision("confirmar_acao", 0.95)],
      "Abri o chamado e chamei um analista.",
    ]);
    expect(conversation.status).toBe("aguardando_atendente");
    expect(conversation.transfer?.reason).toBe("chamado_critico");
  });
});

describe("privacidade", () => {
  it("chamado de outra pessoa não é encontrado, e a regra aparece na transparência", async () => {
    const { agentMsg } = await turn("Qual o status do INC-20412?", [
      [{ tool: "consultar_chamado", args: { numero: "INC-20412" } }],
      [decision("consultar_chamado", 0.85)],
      "Não encontrei o INC-20412 entre os seus chamados.",
    ]);
    expect(agentMsg.meta.steps?.[0]).toMatchObject({ ok: false, label: "tentou consultar o INC-20412" });
    expect(agentMsg.meta.decision?.rules).toContain("Privacidade: só é possível consultar chamados abertos por você.");
  });
});

describe("consulta e prazo vencido", () => {
  it("mostra o chamado, calcula o prazo e registra que está vencido", async () => {
    const { agentMsg } = await turn("INC-20311", [
      [{ tool: "consultar_chamado", args: { numero: "INC-20311" } }],
      [decision("consultar_chamado", 0.95, { opcoesRapidas: ["Falar com um analista", "Adicionar informação", "Não, obrigado"] })],
      "Está sem atualização há 6 dias, acima do prazo. Quer que eu chame um analista?",
    ]);
    expect(agentMsg.meta.steps?.map((s) => s.label)).toEqual(["consultou o INC-20311", "calculou o prazo"]);
    expect(agentMsg.meta.cards?.[0]).toMatchObject({ kind: "ticket", ticket: { number: "INC-20311", sla: { overdue: true } } });
    expect(agentMsg.meta.decision?.rules.join(" ")).toContain("Prazo vencido");
    expect(conversation.focusTicket).toBe("INC-20311");
  });

  it("lista com mais de um aberto vira cartão de seleção", async () => {
    const { agentMsg } = await turn("Qual o status do meu chamado?", [
      [{ tool: "listar_meus_chamados", args: { incluirEncerrados: false } }],
      [decision("consultar_chamado", 0.9)],
      "Você tem 3 chamados abertos. Sobre qual deles quer saber?",
    ]);
    const card = agentMsg.meta.cards?.[0];
    expect(card?.kind).toBe("ticket_list");
    if (card?.kind === "ticket_list") expect(card.tickets.map((t) => t.number)).toEqual(["INC-20311", "INC-20298", "REQ-10442"]);
  });
});

describe("transferência", () => {
  it("o funcionário pede um analista: conversa fica aguardando atendente e o agent para de responder", async () => {
    await turn("INC-20311", [[{ tool: "consultar_chamado", args: { numero: "INC-20311" } }], [decision("consultar_chamado", 0.95)], "Está vencido."]);
    await turn("Quero falar com um analista", [
      [{ tool: "transferir_para_analista", args: { motivo: "pedido_do_funcionario", resumo: "Ana pediu analista: INC-20311 parado há 6 dias, acima do prazo." } }],
      [decision("falar_com_analista", 0.97)],
      "Encaminhei para um analista.",
    ]);
    expect(conversation.status).toBe("aguardando_atendente");
    expect(conversation.transfer).toMatchObject({ reason: "pedido_do_funcionario", ticketNumber: "INC-20311" });

    const ticket = await env.tickets.getTicket({ email: ANA.email, role: "employee" }, "INC-20311");
    expect(ticket.events.at(-1)).toMatchObject({ kind: "transferido" });

    // O modelo NÃO pode ser chamado: roteiro vazio estouraria.
    const paused = await turn("Alguém aí?", []);
    expect(paused.result.kind).toBe("paused");
    expect(paused.agentMsg.role).toBe("employee");
  });

  it("barreira: confiança baixa transfere automaticamente, mesmo que o modelo não peça", async () => {
    const { agentMsg } = await turn("o negócio lá do sistema tá estranho desde aquele dia", [
      [decision("esclarecer", 0.3)],
      "Não entendi bem.",
    ]);
    expect(conversation.status).toBe("aguardando_atendente");
    expect(conversation.transfer).toMatchObject({ reason: "baixa_confianca", confidence: 0.3 });
    expect(agentMsg.meta.decision?.guardrails.join(" ")).toContain("confiança 30% abaixo de 45%");
    expect(agentMsg.content).toContain("chamei um analista");
  });

  it("fora do escopo com confiança baixa não transfere (é só redirecionar)", async () => {
    await turn("Como peço minhas férias?", [[decision("fora_do_escopo", 0.4)], "Isso é com o RH."]);
    expect(conversation.status).toBe("agent");
  });
});

describe("limites e falhas", () => {
  it("limite de 30 mensagens por sessão", async () => {
    for (let i = 0; i < 30; i++) await env.store.appendMessage(conversation.id, { role: "employee", content: `msg ${i}` });
    conversation = await env.store.require(conversation.id);
    const { result } = await turn("mais uma", []);
    expect(result.kind).toBe("limit_reached");
    expect(result.messages[0]?.content).toContain("limite de 30 mensagens");
  });

  it("modelo principal sobrecarregado: responde com o modelo reserva e registra isso", async () => {
    const primary = scriptedModel(() => {
      throw new Error("503 UNAVAILABLE: This model is currently experiencing high demand");
    });
    const reserve = scriptedModel([[decision("conversa", 0.95)], "Olá! Como posso ajudar?"]);
    const result = await handleEmployeeMessage(env.deps(primary.model, reserve.model), { conversation, employee: ANA, text: "oi" });
    const msg = result.messages.at(-1)!;
    expect(msg.content).toBe("Olá! Como posso ajudar?");
    expect(msg.meta.decision?.guardrails.join(" ")).toContain("modelo reserva");
  });

  it("não troca de modelo no meio do turno se uma ferramenta já rodou (evita repetir efeitos)", async () => {
    let calls = 0;
    const busy = () => {
      calls++;
      throw new Error("503 high demand");
    };
    // o Mastra ainda faz uma nova tentativa no mesmo modelo (maxRetries: 1)
    const primary = scriptedModel([[{ tool: "listar_meus_chamados", args: { incluirEncerrados: false } }], busy, busy]);
    const reserve = scriptedModel([]);
    const result = await handleEmployeeMessage(env.deps(primary.model, reserve.model), { conversation, employee: ANA, text: "meus chamados" });
    expect(calls).toBeGreaterThan(0);
    expect(reserve.prompts).toHaveLength(0);
    expect(result.messages.at(-1)?.content).toContain("sobrecarregado");
  });

  it("erro de cota do modelo vira resposta amigável", async () => {
    const scripted = scriptedModel(() => {
      throw new Error("429 RESOURCE_EXHAUSTED: quota exceeded");
    });
    const result = await handleEmployeeMessage(env.deps(scripted.model), { conversation, employee: ANA, text: "oi" });
    expect(result.messages.at(-1)?.content).toContain("sobrecarregado");
  });
});

describe("legado fora do ar", () => {
  it("a ferramenta devolve sistema_indisponivel em vez de quebrar o turno", async () => {
    env.cleanup();
    env = await createTestEnv({ legacyDown: true });
    conversation = await env.store.create({ email: ANA.email, name: ANA.name });
    const { agentMsg, scripted } = await turn("Qual o status do meu chamado?", [
      [{ tool: "listar_meus_chamados", args: { incluirEncerrados: false } }],
      [decision("consultar_chamado", 0.7)],
      "O sistema de chamados está instável agora. Tente de novo em instantes.",
    ]);
    expect(agentMsg.meta.steps?.[0]).toMatchObject({ ok: false, label: "tentou consultar seus chamados" });
    // O resultado da ferramenta que o modelo recebeu explica a falha.
    expect(JSON.stringify(scripted.prompts.at(-1))).toContain("sistema_indisponivel");
  });
});
