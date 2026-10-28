import type { Client, InStatement, Row } from "@libsql/client";
import {
  Article,
  Employee,
  Ticket,
  TicketEvent,
  type Category,
  type Impact,
  type Priority,
  type TicketEventKind,
  type TicketStatus,
  type TicketType,
} from "../domain/types";

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const toTicket = (r: Row): Ticket =>
  Ticket.parse({
    number: r.number,
    type: r.type,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    impact: r.impact,
    requesterEmail: r.requester_email,
    status: r.status,
    createdAt: r.created_at,
    lastSupportUpdateAt: r.last_support_update_at,
    updatedAt: r.updated_at,
    resolvedAt: str(r.resolved_at),
    assignee: str(r.assignee),
  });

const toEvent = (r: Row): TicketEvent =>
  TicketEvent.parse({
    id: Number(r.id),
    ticketNumber: r.ticket_number,
    kind: r.kind,
    actor: r.actor,
    message: r.message,
    createdAt: r.created_at,
  });

export type NewTicket = {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  impact: Impact;
  requesterEmail: string;
};

export type TicketChanges = Partial<{
  status: TicketStatus;
  priority: Priority;
  impact: Impact;
  category: Category;
  lastSupportUpdateAt: string;
  resolvedAt: string | null;
  assignee: string | null;
}>;

const COLUMN: Record<keyof TicketChanges, string> = {
  status: "status",
  priority: "priority",
  impact: "impact",
  category: "category",
  lastSupportUpdateAt: "last_support_update_at",
  resolvedAt: "resolved_at",
  assignee: "assignee",
};

export class Repository {
  constructor(private readonly db: Client) {}

  async findEmployee(email: string): Promise<Employee | null> {
    const { rows } = await this.db.execute({ sql: "SELECT * FROM employees WHERE email = ?", args: [email.toLowerCase()] });
    const r = rows[0];
    return r ? Employee.parse({ email: r.email, name: r.name, department: r.department, role: r.role, device: str(r.device) }) : null;
  }

  async listEmployees(): Promise<Employee[]> {
    const { rows } = await this.db.execute("SELECT * FROM employees ORDER BY name");
    return rows.map((r) => Employee.parse({ email: r.email, name: r.name, department: r.department, role: r.role, device: str(r.device) }));
  }

  async findTicket(number: string): Promise<Ticket | null> {
    const { rows } = await this.db.execute({ sql: "SELECT * FROM tickets WHERE number = ?", args: [number.toUpperCase()] });
    return rows[0] ? toTicket(rows[0]) : null;
  }

  async listTicketsByRequester(email: string): Promise<Ticket[]> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM tickets WHERE requester_email = ? ORDER BY created_at DESC",
      args: [email.toLowerCase()],
    });
    return rows.map(toTicket);
  }

  async listEvents(number: string): Promise<TicketEvent[]> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM ticket_events WHERE ticket_number = ? ORDER BY created_at ASC, id ASC",
      args: [number],
    });
    return rows.map(toEvent);
  }

  async findByIdempotencyKey(key: string, requesterEmail: string): Promise<Ticket | null> {
    const { rows } = await this.db.execute({
      sql: "SELECT ticket_number FROM idempotency_keys WHERE key = ? AND requester_email = ?",
      args: [key, requesterEmail.toLowerCase()],
    });
    const number = rows[0]?.ticket_number;
    return number ? this.findTicket(String(number)) : null;
  }

  async createTicket(input: NewTicket, now: Date, idempotencyKey?: string): Promise<Ticket> {
    const tx = await this.db.transaction("write");
    try {
      const { rows } = await tx.execute({
        sql: "SELECT MAX(CAST(SUBSTR(number, 5) AS INTEGER)) AS max FROM tickets WHERE type = ?",
        args: [input.type],
      });
      const base = input.type === "INC" ? 20000 : 10000;
      const next = Math.max(Number(rows[0]?.max ?? 0), base) + 1;
      const number = `${input.type}-${next}`;
      const ts = now.toISOString();
      await tx.execute({
        sql: `INSERT INTO tickets (number, type, title, description, category, priority, impact, requester_email,
                status, created_at, last_support_update_at, updated_at, resolved_at, assignee)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_analista', ?, ?, ?, NULL, NULL)`,
        args: [number, input.type, input.title, input.description, input.category, input.priority, input.impact, input.requesterEmail, ts, ts, ts],
      });
      await tx.execute({
        sql: "INSERT INTO ticket_events (ticket_number, kind, actor, message, created_at) VALUES (?, 'criado', ?, ?, ?)",
        args: [number, input.requesterEmail, "Chamado aberto pelo Nexo Assist.", ts],
      });
      if (idempotencyKey) {
        await tx.execute({
          sql: "INSERT INTO idempotency_keys (key, requester_email, ticket_number, created_at) VALUES (?, ?, ?, ?)",
          args: [idempotencyKey, input.requesterEmail, number, ts],
        });
      }
      await tx.commit();
      const created = await this.findTicket(number);
      if (!created) throw new Error(`Chamado ${number} não encontrado após criação`);
      return created;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async updateTicket(
    number: string,
    changes: TicketChanges,
    event: { kind: TicketEventKind; actor: string; message: string },
    now: Date,
  ): Promise<Ticket> {
    const ts = now.toISOString();
    const entries = Object.entries(changes) as [keyof TicketChanges, TicketChanges[keyof TicketChanges]][];
    const sets = entries.map(([k]) => `${COLUMN[k]} = ?`);
    const args = entries.map(([, v]) => v ?? null);
    const statements: InStatement[] = [
      { sql: `UPDATE tickets SET ${[...sets, "updated_at = ?"].join(", ")} WHERE number = ?`, args: [...args, ts, number] },
      {
        sql: "INSERT INTO ticket_events (ticket_number, kind, actor, message, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [number, event.kind, event.actor, event.message, ts],
      },
    ];
    await this.db.batch(statements, "write");
    const updated = await this.findTicket(number);
    if (!updated) throw new Error(`Chamado ${number} sumiu durante a atualização`);
    return updated;
  }

  async listArticles(): Promise<Article[]> {
    const { rows } = await this.db.execute("SELECT * FROM articles ORDER BY id");
    return rows.map((r) =>
      Article.parse({ id: r.id, title: r.title, body: r.body, category: r.category, tags: JSON.parse(String(r.tags)) as unknown }),
    );
  }
}
