import { slaFor, type SlaView } from "./sla";
import { CLOSED_STATUSES, type Ticket } from "./types";

/** Chamados resolvidos há até 7 dias são reabertos em vez de duplicados (Anexo A). */
export const REOPEN_WINDOW_DAYS = 7;
const DAY = 24 * 60 * 60_000;

export const isOpen = (ticket: Pick<Ticket, "status">): boolean => !CLOSED_STATUSES.includes(ticket.status);

export function canReopen(ticket: Pick<Ticket, "status" | "resolvedAt">, now: Date): boolean {
  if (ticket.status !== "resolvido" || !ticket.resolvedAt) return false;
  return now.getTime() - new Date(ticket.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * DAY;
}

export type TicketView = Ticket & {
  isOpen: boolean;
  canReopen: boolean;
  sla: SlaView;
};

/** Enriquece o chamado com os campos calculados que o agent e as telas consomem. */
export function toTicketView(ticket: Ticket, now: Date): TicketView {
  const open = isOpen(ticket);
  return {
    ...ticket,
    isOpen: open,
    canReopen: canReopen(ticket, now),
    sla: slaFor(ticket.priority, new Date(ticket.lastSupportUpdateAt), open, now),
  };
}
