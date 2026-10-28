import type { NewTicket, Repository } from "../db/repository";
import { DomainError } from "./errors";
import { searchArticles, type ArticleMatch } from "./knowledge-base";
import { canReopen, isOpen, toTicketView, type TicketView } from "./rules";
import type { ActorRole, Category, Employee, Impact, Priority, TicketEvent, TicketStatus } from "./types";
import { CLOSED_STATUSES } from "./types";

/** Quem está pedindo. Vem do app web (sessão), nunca do texto do chat. */
export type Actor = { email: string; role: ActorRole };

export type TicketDetail = TicketView & { events: TicketEvent[] };

/**
 * Casos de uso do serviço de chamados. Toda regra de permissão mora aqui:
 * funcionário só enxerga e mexe nos próprios chamados; analista vê todos.
 */
export class TicketService {
  constructor(
    private readonly repo: Repository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getEmployee(email: string): Promise<Employee> {
    const employee = await this.repo.findEmployee(email);
    if (!employee) throw new DomainError("unknown_employee", `Funcionário ${email} não encontrado.`);
    return employee;
  }

  listEmployees(): Promise<Employee[]> {
    return this.repo.listEmployees();
  }

  async listTickets(actor: Actor, opts: { requesterEmail?: string; scope: "open" | "all" }): Promise<TicketView[]> {
    const requester = actor.role === "analyst" && opts.requesterEmail ? opts.requesterEmail : actor.email;
    const now = this.clock();
    const tickets = await this.repo.listTicketsByRequester(requester);
    return tickets.filter((t) => opts.scope === "all" || isOpen(t)).map((t) => toTicketView(t, now));
  }

  async getTicket(actor: Actor, number: string): Promise<TicketDetail> {
    const ticket = await this.loadVisible(actor, number);
    const events = await this.repo.listEvents(ticket.number);
    return { ...toTicketView(ticket, this.clock()), events };
  }

  async createTicket(actor: Actor, input: Omit<NewTicket, "requesterEmail">): Promise<TicketView> {
    if (actor.role !== "employee") throw new DomainError("forbidden", "Somente funcionários abrem chamados pelo assistente.");
    await this.getEmployee(actor.email);
    const created = await this.repo.createTicket({ ...input, requesterEmail: actor.email }, this.clock());
    return toTicketView(created, this.clock());
  }

  /**
   * Complemento do funcionário ou atualização do analista.
   * Só a atualização do suporte reinicia o prazo: o funcionário complementar
   * não conta como "o service desk respondeu".
   */
  async addUpdate(actor: Actor, number: string, message: string): Promise<TicketView> {
    const ticket = await this.loadVisible(actor, number);
    if (!isOpen(ticket)) {
      throw new DomainError("ticket_closed", `O chamado ${ticket.number} está encerrado; reabra ou abra um novo.`);
    }
    const now = this.clock();
    const fromSupport = actor.role === "analyst";
    const updated = await this.repo.updateTicket(
      ticket.number,
      fromSupport ? { lastSupportUpdateAt: now.toISOString() } : {},
      { kind: fromSupport ? "atualizacao_suporte" : "complemento", actor: actor.email, message },
      now,
    );
    return toTicketView(updated, now);
  }

  async reclassify(
    actor: Actor,
    number: string,
    changes: { priority?: Priority; impact?: Impact; category?: Category },
    reason: string,
  ): Promise<TicketView> {
    const ticket = await this.loadVisible(actor, number);
    if (!isOpen(ticket)) throw new DomainError("ticket_closed", `O chamado ${ticket.number} está encerrado.`);
    const now = this.clock();
    const updated = await this.repo.updateTicket(ticket.number, changes, { kind: "reclassificado", actor: actor.email, message: reason }, now);
    return toTicketView(updated, now);
  }

  /** Resolvido há até 7 dias volta a ficar aberto (em vez de virar duplicado). */
  async reopen(actor: Actor, number: string, message: string): Promise<TicketView> {
    const ticket = await this.loadVisible(actor, number);
    const now = this.clock();
    if (ticket.status !== "resolvido") {
      throw new DomainError("not_reopenable", `O chamado ${ticket.number} não está resolvido (status: ${ticket.status}).`);
    }
    if (!canReopen(ticket, now)) {
      throw new DomainError("reopen_window_expired", `O chamado ${ticket.number} foi resolvido há mais de 7 dias; abra um novo.`);
    }
    const updated = await this.repo.updateTicket(
      ticket.number,
      { status: "aguardando_analista", resolvedAt: null, lastSupportUpdateAt: now.toISOString() },
      { kind: "reaberto", actor: actor.email, message },
      now,
    );
    return toTicketView(updated, now);
  }

  /** Marca o chamado para atendimento humano, com o resumo que o analista vai ler. */
  async transfer(actor: Actor, number: string, summary: string): Promise<TicketView> {
    const ticket = await this.loadVisible(actor, number);
    if (!isOpen(ticket)) throw new DomainError("ticket_closed", `O chamado ${ticket.number} está encerrado.`);
    const now = this.clock();
    const updated = await this.repo.updateTicket(
      ticket.number,
      { status: "aguardando_analista" },
      { kind: "transferido", actor: actor.email, message: summary },
      now,
    );
    return toTicketView(updated, now);
  }

  async setStatus(actor: Actor, number: string, status: TicketStatus, message: string): Promise<TicketView> {
    if (actor.role !== "analyst") throw new DomainError("forbidden", "Somente analistas mudam o status do chamado.");
    const ticket = await this.loadVisible(actor, number);
    const now = this.clock();
    const closing = CLOSED_STATUSES.includes(status);
    const updated = await this.repo.updateTicket(
      ticket.number,
      {
        status,
        lastSupportUpdateAt: now.toISOString(),
        resolvedAt: status === "resolvido" ? now.toISOString() : closing ? ticket.resolvedAt : null,
        ...(status === "em_atendimento" ? { assignee: actor.email } : {}),
      },
      { kind: "status", actor: actor.email, message },
      now,
    );
    return toTicketView(updated, now);
  }

  async searchKnowledgeBase(query: string): Promise<ArticleMatch[]> {
    return searchArticles(await this.repo.listArticles(), query);
  }

  /**
   * Chamado de outra pessoa responde 404, não 403: assim nem a existência
   * do número vaza para quem não é o dono.
   */
  private async loadVisible(actor: Actor, number: string) {
    const ticket = await this.repo.findTicket(number);
    if (!ticket || (actor.role === "employee" && ticket.requesterEmail !== actor.email.toLowerCase())) {
      throw new DomainError("not_found", `Chamado ${number.toUpperCase()} não encontrado entre os seus chamados.`);
    }
    return ticket;
  }
}
