import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Intent, TransferReason, type Conversation, type Message } from "../conversations/types";
import { formatAgo, formatDayTime, formatDeadline } from "../format";
import { ServiceDesk, toTicketSummary } from "../service-desk";
import { TicketsError, type Actor, type TicketsClient } from "../tickets/client";
import { CATEGORIES, Category, Impact, PRIORITY_LABEL, STATUS_LABEL, TicketType, type Employee, type Ticket } from "../tickets/schemas";
import type { TurnRecorder } from "./recorder";
import { BLOCKING_LEVELS, classifyPriority } from "./triage";

export type ToolDeps = {
  actor: Actor;
  employee: Employee;
  tickets: TicketsClient;
  desk: ServiceDesk;
  recorder: TurnRecorder;
  clock: () => Date;
  history?: Message[];
};

const IMPACT_ANSWER =
  /\b(s[óo]|apenas|somente)\s+(eu|comigo|a mim|o meu|a minha|no meu|na minha)\b|\bequipe\b|\bmeu time\b|\bo time\b|\bsetor\b|\bdepartamento\b|\btodo mundo\b|\btodos\b|\bempresa\b|\bningu[ée]m\b|\bn[ãa]o sei\b|\boutr[oa]s? (colegas|pessoas)\b|\bmais (gente|pessoas|algu[ée]m)\b/i;

export function impactWasDiscussed(history: Message[]): boolean {
  return history.some(
    (m) => (m.role === "employee" && IMPACT_ANSWER.test(m.content)) || (m.role === "agent" && /afetad/i.test(m.content)),
  );
}

type ToolFailure = { ok: false; erro: string; mensagem: string };

function failure(err: unknown): ToolFailure {
  if (err instanceof TicketsError) {
    const mensagem =
      err.kind === "unavailable"
        ? "O sistema de chamados está indisponível agora (tentei 3 vezes). Nada foi perdido; peça para tentar novamente em instantes."
        : err.message;
    return { ok: false, erro: err.kind === "unavailable" ? "sistema_indisponivel" : err.code, mensagem };
  }
  throw err;
}

const unavailable = (r: ToolFailure) => r.erro === "sistema_indisponivel";

function ticketForModel(t: Ticket, now: Date) {
  return {
    numero: t.number,
    tipo: t.type,
    titulo: t.title,
    descricao: t.description,
    categoria: t.category,
    prioridade: PRIORITY_LABEL[t.priority],
    status: STATUS_LABEL[t.status],
    aberto: t.isOpen,
    abertoEm: formatDayTime(t.createdAt),
    ultimaAtualizacaoDoSuporte: formatAgo(t.lastSupportUpdateAt, now),
    prazo: t.isOpen
      ? { regra: t.sla.label, vence: formatDeadline(t.sla.dueAt, now), vencido: t.sla.overdue }
      : null,
    podeSerReaberto: t.canReopen,
  };
}

export function createAgentTools(deps: ToolDeps) {
  const { actor, tickets, desk, recorder, clock } = deps;
  const conv = (): Conversation => recorder.conversation;

  const buscarCentralAjuda = createTool({
    id: "buscar_central_ajuda",
    description:
      "Busca artigos na central de ajuda de TI. Use primeiro em qualquer dúvida ou problema, antes de abrir chamado. " +
      "Leia as condições do artigo (ex.: vale só para um sistema operacional) e compare com o equipamento do funcionário.",
    inputSchema: z.object({ consulta: z.string().min(2).describe("Descrição do problema em poucas palavras") }),
    execute: async ({ consulta }) => {
      try {
        const results = await tickets.searchKnowledgeBase(actor, consulta);
        const artigos = results.map((r) => ({ id: r.article.id, titulo: r.article.title, conteudo: r.article.body }));
        recorder.step("buscar_central_ajuda", "buscou na central de ajuda", true, { consulta }, artigos.map((a) => `${a.id} · ${a.titulo}`));
        return { ok: true as const, artigos, observacao: artigos.length ? undefined : "Nenhum artigo encontrado." };
      } catch (err) {
        const f = failure(err);
        recorder.step("buscar_central_ajuda", "tentou buscar na central de ajuda", false, { consulta }, f.mensagem);
        return f;
      }
    },
  });

  const listarMeusChamados = createTool({
    id: "listar_meus_chamados",
    description:
      "Lista os chamados do funcionário desta conversa (somente dele). Use quando ele perguntar pelos chamados ou por um chamado sem dizer qual.",
    inputSchema: z.object({ incluirEncerrados: z.boolean().default(false).describe("true para incluir resolvidos/cancelados") }),
    execute: async ({ incluirEncerrados }) => {
      try {
        const now = clock();
        const list = await tickets.listTickets(actor, { scope: incluirEncerrados ? "all" : "open" });
        const open = list.filter((t) => t.isOpen);
        recorder.step("listar_meus_chamados", "consultou seus chamados", true, { incluirEncerrados }, list.map((t) => `${t.number} · ${STATUS_LABEL[t.status]}`));
        if (open.length > 1) recorder.card({ kind: "ticket_list", tickets: open.map(toTicketSummary) });
        const vencidos = open.filter((t) => t.sla.overdue).map((t) => t.number);
        if (vencidos.length) recorder.rule(`Prazo vencido em ${vencidos.join(", ")}.`);
        return { ok: true as const, total: list.length, abertos: open.length, chamados: list.map((t) => ticketForModel(t, now)) };
      } catch (err) {
        const f = failure(err);
        recorder.step("listar_meus_chamados", "tentou consultar seus chamados", false, { incluirEncerrados }, f.mensagem);
        return f;
      }
    },
  });

  const consultarChamado = createTool({
    id: "consultar_chamado",
    description:
      "Consulta um chamado do funcionário pelo número (ex.: INC-20311): status, último movimento e prazo. " +
      "Só funciona para chamados abertos por ele; para outros responde que não encontrou.",
    inputSchema: z.object({ numero: z.string().regex(/^(INC|REQ)-\d+$/i, "formato INC-12345 ou REQ-12345") }),
    execute: async ({ numero }) => {
      const number = numero.toUpperCase();
      try {
        const now = clock();
        const t = await tickets.getTicket(actor, number);
        recorder.step("consultar_chamado", `consultou o ${t.number}`, true, { numero: number }, `${STATUS_LABEL[t.status]} · ${PRIORITY_LABEL[t.priority]}`);
        if (t.isOpen) recorder.step("consultar_chamado", "calculou o prazo", true, { prioridade: t.priority }, t.sla);
        recorder.card({ kind: "ticket", ticket: toTicketSummary(t) });
        if (t.sla.overdue) {
          recorder.rule(`Prazo vencido: o ${t.number} está sem atualização do suporte ${formatAgo(t.lastSupportUpdateAt, now)}, acima do prazo de ${t.sla.label}.`);
        }
        await setFocus(t.number);
        const eventos = t.events.slice(-3).map((e) => ({ quando: formatDayTime(e.createdAt), oque: e.message }));
        return { ok: true as const, chamado: ticketForModel(t, now), ultimosEventos: eventos };
      } catch (err) {
        const f = failure(err);
        if (f.erro === "not_found") recorder.rule("Privacidade: só é possível consultar chamados abertos por você.");
        recorder.step("consultar_chamado", `tentou consultar o ${number}`, false, { numero: number }, f.mensagem);
        return f;
      }
    },
  });

  const prepararRascunho = createTool({
    id: "preparar_rascunho_chamado",
    description:
      "Monta o RASCUNHO de um chamado novo para o funcionário conferir. NÃO cria o chamado. " +
      "A prioridade e o prazo são calculados pelo sistema a partir de impacto e urgência. " +
      "Antes de montar, verifica chamados parecidos: se devolver possivel_duplicado, pergunte ao funcionário se é o mesmo problema.",
    inputSchema: z.object({
      tipo: TicketType.describe("INC quando algo parou ou não funciona; REQ para pedido de acesso, equipamento ou software"),
      titulo: z.string().min(5).max(90).describe("Curto e específico, ex.: 'VPN não conecta no notebook — erro 809'"),
      descricao: z.string().min(10).max(600).describe("O que acontece, desde quando, o que já foi tentado e o contexto (ex.: reunião às 14h)"),
      categoria: Category.describe(`Uma de: ${CATEGORIES.join(", ")}`),
      impacto: Impact.describe("individual = só o funcionário; equipe; empresa. Se ele disser 'não sei', use individual"),
      bloqueio: z.enum(BLOCKING_LEVELS).describe("parado = não consegue trabalhar; atrapalha = há alternativa; sem_urgencia = pedido/melhoria"),
      compromissoHoje: z.boolean().describe("Há reunião, entrega ou prazo HOJE que depende disso"),
      ignorarPossiveisDuplicados: z
        .boolean()
        .default(false)
        .describe("true somente depois que o funcionário disse que NÃO é o mesmo problema dos chamados parecidos"),
    }),
    execute: async (input) => {
      if (deps.history && !impactWasDiscussed(deps.history)) {
        recorder.guardrail("Bloqueado: o agent tentou montar o rascunho sem saber quem é afetado.");
        recorder.rule("Prioridade: antes do rascunho é preciso saber quem é afetado, porque o impacto define a prioridade.");
        return {
          ok: false as const,
          erro: "falta_quem_e_afetado",
          mensagem:
            "Ainda não sei quem é afetado. Pergunte só isso agora, com as opções rápidas \"Só eu\", \"Minha equipe\", \"Toda a empresa\", \"Não sei\". Não monte o rascunho neste turno.",
        };
      }
      try {
        if (!input.ignorarPossiveisDuplicados) {
          const all = await tickets.listTickets(actor, { scope: "all" });
          const parecidos = all.filter((t) => t.category === input.categoria && (t.isOpen || t.canReopen));
          recorder.step("preparar_rascunho_chamado", "consultou seus chamados", true, { categoria: input.categoria }, parecidos.map((t) => t.number));
          if (parecidos.length) {
            recorder.rule(`Sem duplicidade: há chamado(s) de ${input.categoria} que podem ser o mesmo problema (${parecidos.map((t) => t.number).join(", ")}).`);
            return {
              ok: true as const,
              status: "possivel_duplicado" as const,
              instrucao:
                "Pergunte se é o mesmo problema. Se for, use preparar_atualizacao no chamado existente (aberto: complemento; resolvido há até 7 dias: reabertura). Se não for, chame de novo com ignorarPossiveisDuplicados=true.",
              parecidos: parecidos.map((t) => ticketForModel(t, clock())),
            };
          }
        }
        const triage = classifyPriority({ impact: input.impacto, blocking: input.bloqueio, deadlineToday: input.compromissoHoje });
        const { conversation, action } = await desk.draftTicket(actor, conv(), {
          type: input.tipo,
          title: input.titulo,
          description: input.descricao,
          category: input.categoria,
          impact: input.impacto,
          blocking: input.bloqueio,
          deadlineToday: input.compromissoHoje,
        });
        recorder.conversation = conversation;
        recorder.step("preparar_rascunho_chamado", "classificou a prioridade", true, { impacto: input.impacto, bloqueio: input.bloqueio, compromissoHoje: input.compromissoHoje }, PRIORITY_LABEL[triage.priority]);
        recorder.step("preparar_rascunho_chamado", "consultou o SLA", true, { prioridade: triage.priority }, action.draft.sla);
        recorder.step("preparar_rascunho_chamado", "montou o rascunho", true, { titulo: input.titulo }, action.id);
        recorder.rule(`Prioridade ${PRIORITY_LABEL[triage.priority].toLowerCase()}: ${triage.rule}`);
        recorder.rule("Confirmação: o chamado só é criado depois que você confirmar o rascunho.");
        recorder.card(ServiceDesk.pendingCard(action));
        return {
          ok: true as const,
          status: "rascunho_pronto" as const,
          rascunhoId: action.id,
          prioridade: PRIORITY_LABEL[triage.priority],
          motivoDaPrioridade: triage.rule,
          respostaAte: formatDeadline(action.draft.sla.dueAt, clock()),
          instrucao: "O cartão do rascunho já aparece para o funcionário. Explique a prioridade em uma frase e peça para conferir e confirmar. Não diga que o chamado foi criado.",
        };
      } catch (err) {
        const f = failure(err);
        recorder.step("preparar_rascunho_chamado", "tentou montar o rascunho", false, input, f.mensagem);
        return f;
      }
    },
  });

  const prepararAtualizacao = createTool({
    id: "preparar_atualizacao",
    description:
      "Prepara uma atualização de um chamado existente do funcionário para ele confirmar: complemento de informação, ou reabertura " +
      "se estiver resolvido há até 7 dias. Pode reclassificar a prioridade se o impacto mudou. NÃO aplica nada sem confirmação.",
    inputSchema: z.object({
      numero: z.string().regex(/^(INC|REQ)-\d+$/i),
      mensagem: z.string().min(5).max(600).describe("O texto que vai para o chamado, escrito de forma objetiva"),
      reclassificar: z
        .object({ impacto: Impact, bloqueio: z.enum(BLOCKING_LEVELS), compromissoHoje: z.boolean() })
        .optional()
        .describe("Só se o funcionário trouxe fatos que mudam impacto ou urgência"),
    }),
    execute: async ({ numero, mensagem, reclassificar }) => {
      const number = numero.toUpperCase();
      try {
        const t = await tickets.getTicket(actor, number);
        recorder.step("preparar_atualizacao", `consultou o ${t.number}`, true, { numero: number }, STATUS_LABEL[t.status]);
        if (!t.isOpen && !t.canReopen) {
          recorder.rule(`Reabertura: o ${t.number} foi encerrado há mais de 7 dias, então vira chamado novo.`);
          return {
            ok: true as const,
            status: "nao_pode_reabrir" as const,
            instrucao: "Explique que o chamado foi encerrado há mais de 7 dias e prepare um chamado novo com preparar_rascunho_chamado (ignorarPossiveisDuplicados=true).",
          };
        }
        const mode = t.isOpen ? ("complemento" as const) : ("reabertura" as const);
        let reclassify: { priority: Ticket["priority"]; rule: string } | null = null;
        if (reclassificar) {
          const triage = classifyPriority({ impact: reclassificar.impacto, blocking: reclassificar.bloqueio, deadlineToday: reclassificar.compromissoHoje });
          if (triage.priority !== t.priority) {
            reclassify = { priority: triage.priority, rule: triage.rule };
            recorder.step("preparar_atualizacao", "reclassificou a prioridade", true, reclassificar, PRIORITY_LABEL[triage.priority]);
            recorder.rule(`Prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()} → ${PRIORITY_LABEL[triage.priority].toLowerCase()}: ${triage.rule}`);
          }
        }
        if (mode === "reabertura") recorder.rule(`Sem duplicidade: o ${t.number} foi resolvido há até 7 dias, então é reaberto em vez de abrir outro.`);
        else recorder.rule(`Sem duplicidade: o ${t.number} já está aberto, então é atualizado em vez de abrir outro.`);
        recorder.rule("Confirmação: a atualização só é aplicada depois que você confirmar.");
        const { conversation, action } = await desk.proposeUpdate(conv(), {
          ticketNumber: t.number,
          ticketTitle: t.title,
          mode,
          message: mensagem,
          reclassify,
        });
        recorder.conversation = conversation;
        await setFocus(t.number);
        recorder.step("preparar_atualizacao", mode === "reabertura" ? "montou a reabertura" : "montou a atualização", true, { mensagem }, action.id);
        recorder.card(ServiceDesk.pendingCard(action));
        return {
          ok: true as const,
          status: "atualizacao_pronta" as const,
          rascunhoId: action.id,
          modo: mode,
          instrucao: "O cartão já aparece para o funcionário. Peça para conferir e confirmar. Não diga que foi aplicado.",
        };
      } catch (err) {
        const f = failure(err);
        recorder.step("preparar_atualizacao", `tentou preparar a atualização do ${number}`, false, { numero: number }, f.mensagem);
        return f;
      }
    },
  });

  const confirmarAcao = createTool({
    id: "confirmar_acao_pendente",
    description:
      "Executa o rascunho pendente (cria, atualiza ou reabre o chamado). Use SOMENTE quando o funcionário confirmar explicitamente, " +
      "numa mensagem depois de ver o rascunho (ex.: 'pode criar', 'confirmo'). Nunca no mesmo turno em que o rascunho foi montado.",
    inputSchema: z.object({ rascunhoId: z.string().describe("Ex.: D-381") }),
    execute: async ({ rascunhoId }) => {
      const pending = conv().pendingAction;
      if (!pending || pending.id !== rascunhoId) {
        recorder.guardrail(`Bloqueado: tentativa de confirmar ${rascunhoId}, que não é o rascunho pendente.`);
        return { ok: false as const, erro: "rascunho_inexistente", mensagem: "Não há esse rascunho pendente. Monte um novo e peça confirmação." };
      }
      if (new Date(pending.proposedAt) >= recorder.startedAt) {
        recorder.guardrail("Bloqueado: o agent tentou confirmar um rascunho no mesmo turno em que o montou.");
        return { ok: false as const, erro: "confirmacao_prematura", mensagem: "O funcionário ainda não viu o rascunho. Peça para ele conferir e confirmar." };
      }
      try {
        const outcome = await desk.confirmPending(actor, conv(), rascunhoId);
        recorder.conversation = outcome.autoTransfer?.conversation ?? (await refreshed());
        const label = { criado: `criou o chamado ${outcome.ticket.number}`, atualizado: `atualizou o ${outcome.ticket.number}`, reaberto: `reabriu o ${outcome.ticket.number}` }[outcome.kind];
        recorder.step("confirmar_acao_pendente", label, true, { rascunhoId }, outcome.summary);
        recorder.card({ kind: "ticket", ticket: toTicketSummary(outcome.ticket) });
        if (outcome.autoTransfer) {
          recorder.transferred = true;
          recorder.step("confirmar_acao_pendente", "chamou um analista", true, { motivo: "chamado_critico" }, outcome.autoTransfer.contactEstimate);
          recorder.rule("Transferência: chamados críticos vão direto para um analista.");
        }
        return {
          ok: true as const,
          resultado: outcome.summary,
          transferidoParaAnalista: Boolean(outcome.autoTransfer),
          contatoDoAnalista: outcome.autoTransfer?.contactEstimate,
        };
      } catch (err) {
        const f = failure(err);
        recorder.step("confirmar_acao_pendente", "tentou aplicar o rascunho", false, { rascunhoId }, f.mensagem);
        if (unavailable(f)) recorder.rule("O rascunho continua salvo: é só confirmar de novo quando o sistema voltar.");
        return f;
      }
    },
  });

  const cancelarAcao = createTool({
    id: "cancelar_acao_pendente",
    description: "Descarta o rascunho pendente quando o funcionário desistir ou quiser recomeçar.",
    inputSchema: z.object({}),
    execute: async () => {
      recorder.conversation = await desk.cancelPending(conv());
      recorder.step("cancelar_acao_pendente", "descartou o rascunho", true, {}, null);
      return { ok: true as const };
    },
  });

  const transferir = createTool({
    id: "transferir_para_analista",
    description:
      "Transfere a conversa para um analista humano. Depois disso você para de responder até o analista devolver. " +
      "Use quando: o funcionário pedir; o caso for crítico; o chamado estiver vencido e ele aceitar ajuda; ou você não tiver segurança.",
    inputSchema: z.object({
      motivo: TransferReason.exclude(["limite_de_mensagens"]),
      resumo: z
        .string()
        .min(20)
        .max(800)
        .describe("Resumo para o analista: problema, o que já foi tentado, chamados envolvidos e o que o funcionário espera"),
    }),
    execute: async ({ motivo, resumo }) => {
      const confidence = recorder.decision?.confidence ?? null;
      const outcome = await desk.transfer(actor, conv(), { reason: motivo, summary: resumo, confidence });
      recorder.conversation = outcome.conversation;
      recorder.transferred = true;
      recorder.step("transferir_para_analista", "chamou um analista", true, { motivo }, outcome.contactEstimate);
      recorder.rule("Transferência: a conversa fica aguardando atendente e o agent para de responder até ser liberado.");
      return {
        ok: true as const,
        contatoDoAnalista: outcome.contactEstimate,
        instrucao: "Avise que um analista vai continuar a conversa aqui e quando ele deve falar. Não faça mais perguntas.",
      };
    },
  });

  const registrarDecisao = createTool({
    id: "registrar_decisao",
    description:
      "Registra a sua decisão neste turno para o funcionário e o analista verem. Chame EXATAMENTE UMA VEZ, como última ferramenta, antes de escrever a resposta.",
    inputSchema: z.object({
      intencao: Intent.exclude(["indefinida"]).describe("O que o funcionário quer"),
      acao: z.string().min(3).max(120).describe("O que você fez, em uma frase curta. Ex.: 'Montei o rascunho do chamado'"),
      confianca: z
        .number()
        .min(0)
        .max(1)
        .describe("0 a 1. 0.9+ quando os fatos vieram das ferramentas; 0.6–0.8 provável; abaixo de 0.45 quando não sabe o que fazer"),
      motivo: z.string().min(5).max(300).describe("Por que respondeu assim, falando com o funcionário ('Você tem reunião hoje, então...')"),
      opcoesRapidas: z.array(z.string().min(1).max(30)).max(4).optional().describe("Até 4 respostas curtas para o funcionário clicar"),
    }),
    execute: async ({ intencao, acao, confianca, motivo, opcoesRapidas }) => {
      recorder.decision = { intent: intencao, action: acao, confidence: confianca, reason: motivo, quickReplies: opcoesRapidas ?? [] };
      return { ok: true as const };
    },
  });

  async function setFocus(number: string) {
    if (conv().focusTicket !== number) {
      recorder.conversation = await deps.desk.setFocusTicket(conv(), number);
    }
  }

  async function refreshed(): Promise<Conversation> {
    return deps.desk.reload(conv());
  }

  return {
    buscar_central_ajuda: buscarCentralAjuda,
    listar_meus_chamados: listarMeusChamados,
    consultar_chamado: consultarChamado,
    preparar_rascunho_chamado: prepararRascunho,
    preparar_atualizacao: prepararAtualizacao,
    confirmar_acao_pendente: confirmarAcao,
    cancelar_acao_pendente: cancelarAcao,
    transferir_para_analista: transferir,
    registrar_decisao: registrarDecisao,
  };
}
