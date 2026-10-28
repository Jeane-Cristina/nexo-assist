import { z } from "zod";
import { Category, Impact, Priority, TicketType } from "../tickets/schemas";
import { BLOCKING_LEVELS } from "../agent/triage";

/**
 * Modelo da conversa. Ele é persistido no banco do app (não no serviço de
 * chamados), porque conversa, pausa do agent e transferência são conceitos do
 * atendimento, e não do sistema legado.
 */

export const ConversationStatus = z.enum(["agent", "aguardando_atendente", "em_atendimento", "encerrada"]);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const MAX_EMPLOYEE_MESSAGES = 30;

export const TransferReason = z.enum(["pedido_do_funcionario", "chamado_critico", "chamado_vencido", "baixa_confianca", "limite_de_mensagens", "outro"]);
export type TransferReason = z.infer<typeof TransferReason>;

export const TRANSFER_REASON_LABEL: Record<TransferReason, string> = {
  pedido_do_funcionario: "Funcionário pediu um analista",
  chamado_critico: "Chamado crítico",
  chamado_vencido: "Chamado com prazo vencido",
  baixa_confianca: "Agent sem segurança",
  limite_de_mensagens: "Limite de mensagens da sessão",
  outro: "Outro motivo",
};

export const Transfer = z.object({
  reason: TransferReason,
  summary: z.string(),
  at: z.string(),
  ticketNumber: z.string().nullable(),
  /** Confiança do agent no momento, quando a transferência foi por insegurança. */
  confidence: z.number().nullable(),
});
export type Transfer = z.infer<typeof Transfer>;

export const DraftTicket = z.object({
  type: TicketType,
  title: z.string(),
  description: z.string(),
  category: Category,
  impact: Impact,
  blocking: z.enum(BLOCKING_LEVELS),
  deadlineToday: z.boolean(),
  priority: Priority,
  priorityRule: z.string(),
  sla: z.object({ label: z.string(), dueAt: z.string() }),
});
export type DraftTicket = z.infer<typeof DraftTicket>;

export const PendingAction = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("create"), proposedAt: z.string(), draft: DraftTicket }),
  z.object({
    id: z.string(),
    kind: z.literal("update"),
    proposedAt: z.string(),
    ticketNumber: z.string(),
    ticketTitle: z.string(),
    mode: z.enum(["complemento", "reabertura"]),
    message: z.string(),
    reclassify: z.object({ priority: Priority, rule: z.string() }).nullable(),
  }),
]);
export type PendingAction = z.infer<typeof PendingAction>;

export const Conversation = z.object({
  id: z.string(),
  employeeEmail: z.string(),
  employeeName: z.string(),
  status: ConversationStatus,
  assignedAnalyst: z.string().nullable(),
  transfer: Transfer.nullable(),
  focusTicket: z.string().nullable(),
  pendingAction: PendingAction.nullable(),
  employeeMessageCount: z.number(),
  /** Última confiança registrada pelo agent (aparece no console). */
  lastConfidence: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof Conversation>;

// ---------------------------------------------------------------------------
// Mensagens e o que o agent mostra sobre a própria decisão

export const MessageRole = z.enum(["employee", "agent", "analyst", "system"]);
export type MessageRole = z.infer<typeof MessageRole>;

/** Uma ação do agent, como aparece acima da resposta ("consultou seus chamados"). */
export const Step = z.object({
  tool: z.string(),
  label: z.string(),
  ok: z.boolean(),
  /** O que foi pedido à ferramenta e um resumo do que voltou — para o painel de detalhes. */
  input: z.unknown(),
  output: z.unknown(),
});
export type Step = z.infer<typeof Step>;

export const Intent = z.enum([
  "duvida",
  "consultar_chamado",
  "abrir_chamado",
  "atualizar_chamado",
  "confirmar_acao",
  "falar_com_analista",
  "fora_do_escopo",
  "conversa",
  "esclarecer",
  "indefinida",
]);
export type Intent = z.infer<typeof Intent>;

export const INTENT_LABEL: Record<Intent, string> = {
  duvida: "Dúvida",
  consultar_chamado: "Consulta de chamado",
  abrir_chamado: "Abertura de chamado",
  atualizar_chamado: "Atualização de chamado",
  confirmar_acao: "Confirmação",
  falar_com_analista: "Falar com analista",
  fora_do_escopo: "Fora do escopo de TI",
  conversa: "Conversa",
  esclarecer: "Preciso entender melhor",
  indefinida: "Não identificada",
};

export const Decision = z.object({
  intent: Intent,
  /** O que o agent fez, em uma frase curta. */
  action: z.string(),
  /** 0 a 1. null quando o agent não registrou. */
  confidence: z.number().min(0).max(1).nullable(),
  /** Por que respondeu assim, para o funcionário entender. */
  reason: z.string(),
  /** Regras de negócio aplicadas pelo código (prioridade, duplicidade, privacidade...). */
  rules: z.array(z.string()),
  /** Intervenções automáticas do código sobre a decisão do modelo. */
  guardrails: z.array(z.string()),
});
export type Decision = z.infer<typeof Decision>;

const TicketSummary = z.object({
  number: z.string(),
  title: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  priority: Priority,
  category: Category,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSupportUpdateAt: z.string(),
  description: z.string(),
  sla: z.object({ label: z.string(), dueAt: z.string(), overdue: z.boolean() }),
});
export type TicketSummary = z.infer<typeof TicketSummary>;

export const Card = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ticket_list"), tickets: z.array(TicketSummary) }),
  z.object({ kind: z.literal("ticket"), ticket: TicketSummary }),
  z.object({ kind: z.literal("pending_action"), action: PendingAction }),
]);
export type Card = z.infer<typeof Card>;

export const MessageMeta = z.object({
  steps: z.array(Step).optional(),
  decision: Decision.optional(),
  cards: z.array(Card).optional(),
  quickReplies: z.array(z.string()).optional(),
});
export type MessageMeta = z.infer<typeof MessageMeta>;

export const Message = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: MessageRole,
  authorName: z.string().nullable(),
  content: z.string(),
  meta: MessageMeta,
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;
