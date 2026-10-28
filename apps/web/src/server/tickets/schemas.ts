import { z } from "zod";

/**
 * Contrato do serviço de chamados, do ponto de vista de quem consome.
 * O app web valida tudo o que recebe do "legado": se o formato mudar,
 * o erro aparece aqui, com mensagem clara, e não dentro do agent.
 */

export const CATEGORIES = ["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

export const Priority = z.enum(["critica", "alta", "media", "baixa"]);
export type Priority = z.infer<typeof Priority>;

export const Impact = z.enum(["individual", "equipe", "empresa"]);
export type Impact = z.infer<typeof Impact>;

export const TicketType = z.enum(["INC", "REQ"]);
export type TicketType = z.infer<typeof TicketType>;

export const TicketStatus = z.enum(["aguardando_analista", "em_andamento", "em_atendimento", "aprovado", "resolvido", "cancelado"]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const Sla = z.object({ label: z.string(), dueAt: z.string(), overdue: z.boolean() });

export const Ticket = z.object({
  number: z.string(),
  type: TicketType,
  title: z.string(),
  description: z.string(),
  category: Category,
  priority: Priority,
  impact: Impact,
  requesterEmail: z.string(),
  status: TicketStatus,
  createdAt: z.string(),
  lastSupportUpdateAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  assignee: z.string().nullable(),
  isOpen: z.boolean(),
  canReopen: z.boolean(),
  sla: Sla,
});
export type Ticket = z.infer<typeof Ticket>;

export const TicketEvent = z.object({
  id: z.number(),
  kind: z.string(),
  actor: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export type TicketEvent = z.infer<typeof TicketEvent>;

export const TicketDetail = Ticket.extend({ events: z.array(TicketEvent) });
export type TicketDetail = z.infer<typeof TicketDetail>;

export const Employee = z.object({
  email: z.string(),
  name: z.string(),
  department: z.string(),
  role: z.enum(["employee", "analyst"]),
  device: z.string().nullable(),
});
export type Employee = z.infer<typeof Employee>;

export const ArticleMatch = z.object({
  article: z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    category: Category,
    tags: z.array(z.string()),
  }),
  score: z.number(),
  matchedTerms: z.array(z.string()),
});
export type ArticleMatch = z.infer<typeof ArticleMatch>;

export const PRIORITY_LABEL: Record<Priority, string> = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aguardando_analista: "Aguardando analista",
  em_andamento: "Em andamento",
  em_atendimento: "Em atendimento",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};

export const IMPACT_LABEL: Record<Impact, string> = { individual: "Somente você", equipe: "Sua equipe", empresa: "Toda a empresa" };
