import { z } from "zod";

/**
 * Vocabulário do service desk (Anexo A do PRD).
 * Tudo que entra e sai do serviço passa por estes schemas, então o tipo
 * TypeScript e a validação em runtime nunca divergem.
 */

export const TICKET_TYPES = ["INC", "REQ"] as const;
export const TicketType = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketType>;

export const CATEGORIES = ["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

export const PRIORITIES = ["critica", "alta", "media", "baixa"] as const;
export const Priority = z.enum(PRIORITIES);
export type Priority = z.infer<typeof Priority>;

/** Quantas pessoas o problema afeta — é metade da conta da prioridade. */
export const IMPACTS = ["individual", "equipe", "empresa"] as const;
export const Impact = z.enum(IMPACTS);
export type Impact = z.infer<typeof Impact>;

export const STATUSES = [
  "aguardando_analista",
  "em_andamento",
  "em_atendimento",
  "aprovado",
  "resolvido",
  "cancelado",
] as const;
export const TicketStatus = z.enum(STATUSES);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const CLOSED_STATUSES: readonly TicketStatus[] = ["resolvido", "cancelado"];

export const EVENT_KINDS = [
  "criado",
  "complemento",
  "atualizacao_suporte",
  "status",
  "reaberto",
  "reclassificado",
  "transferido",
] as const;
export const TicketEventKind = z.enum(EVENT_KINDS);
export type TicketEventKind = z.infer<typeof TicketEventKind>;

export const ActorRole = z.enum(["employee", "analyst"]);
export type ActorRole = z.infer<typeof ActorRole>;

export const Employee = z.object({
  email: z.string().email(),
  name: z.string(),
  department: z.string(),
  role: ActorRole,
  /** Equipamento principal — o agent usa para aplicar artigos que dependem do SO. */
  device: z.string().nullable(),
});
export type Employee = z.infer<typeof Employee>;

export const Ticket = z.object({
  number: z.string(),
  type: TicketType,
  title: z.string(),
  description: z.string(),
  category: Category,
  priority: Priority,
  impact: Impact,
  requesterEmail: z.string().email(),
  status: TicketStatus,
  createdAt: z.string(),
  /** Última atualização feita pelo suporte (é o que reinicia o prazo). */
  lastSupportUpdateAt: z.string(),
  /** Última movimentação de qualquer tipo, inclusive complemento do funcionário. */
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  assignee: z.string().nullable(),
});
export type Ticket = z.infer<typeof Ticket>;

export const TicketEvent = z.object({
  id: z.number(),
  ticketNumber: z.string(),
  kind: TicketEventKind,
  actor: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export type TicketEvent = z.infer<typeof TicketEvent>;

export const Article = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: Category,
  tags: z.array(z.string()),
});
export type Article = z.infer<typeof Article>;

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aguardando_analista: "Aguardando analista",
  em_andamento: "Em andamento",
  em_atendimento: "Em atendimento",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};
