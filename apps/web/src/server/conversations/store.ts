import { randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import {
  Conversation,
  Message,
  MessageMeta,
  PendingAction,
  Transfer,
  type ConversationStatus,
  type MessageRole,
} from "./types";

/** Persistência de conversas e mensagens. Única camada que conhece SQL no app web. */

const json = <T>(v: unknown, parse: (x: unknown) => T): T | null => (v === null || v === undefined ? null : parse(JSON.parse(String(v))));

const toConversation = (r: Row): Conversation =>
  Conversation.parse({
    id: r.id,
    employeeEmail: r.employee_email,
    employeeName: r.employee_name,
    status: r.status,
    assignedAnalyst: r.assigned_analyst ?? null,
    transfer: json(r.transfer, (x) => Transfer.parse(x)),
    focusTicket: r.focus_ticket ?? null,
    pendingAction: json(r.pending_action, (x) => PendingAction.parse(x)),
    employeeMessageCount: Number(r.employee_message_count),
    lastConfidence: r.last_confidence === null ? null : Number(r.last_confidence),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

const toMessage = (r: Row): Message =>
  Message.parse({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    authorName: r.author_name ?? null,
    content: r.content,
    meta: MessageMeta.parse(JSON.parse(String(r.meta))),
    createdAt: r.created_at,
  });

export type ConversationPatch = Partial<
  Pick<Conversation, "status" | "assignedAnalyst" | "transfer" | "focusTicket" | "pendingAction" | "lastConfidence">
>;

const COLUMNS: Record<keyof ConversationPatch, { column: string; encode: (v: unknown) => string | number | null }> = {
  status: { column: "status", encode: (v) => v as string },
  assignedAnalyst: { column: "assigned_analyst", encode: (v) => (v as string | null) ?? null },
  transfer: { column: "transfer", encode: (v) => (v ? JSON.stringify(v) : null) },
  focusTicket: { column: "focus_ticket", encode: (v) => (v as string | null) ?? null },
  pendingAction: { column: "pending_action", encode: (v) => (v ? JSON.stringify(v) : null) },
  lastConfidence: { column: "last_confidence", encode: (v) => (v as number | null) ?? null },
};

export type NewMessage = {
  role: MessageRole;
  authorName?: string | null;
  content: string;
  meta?: MessageMeta;
};

export class ConversationStore {
  constructor(
    private readonly db: Client,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(employee: { email: string; name: string }): Promise<Conversation> {
    const id = randomUUID();
    const ts = this.clock().toISOString();
    await this.db.execute({
      sql: `INSERT INTO conversations (id, employee_email, employee_name, status, created_at, updated_at)
            VALUES (?, ?, ?, 'agent', ?, ?)`,
      args: [id, employee.email, employee.name, ts, ts],
    });
    return this.require(id);
  }

  async get(id: string): Promise<Conversation | null> {
    const { rows } = await this.db.execute({ sql: "SELECT * FROM conversations WHERE id = ?", args: [id] });
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async require(id: string): Promise<Conversation> {
    const c = await this.get(id);
    if (!c) throw new Error(`Conversa ${id} não encontrada`);
    return c;
  }

  /** Conversa em aberto mais recente do funcionário — é o que permite "voltar outro dia e continuar". */
  async findActiveForEmployee(email: string): Promise<Conversation | null> {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM conversations WHERE employee_email = ? AND status != 'encerrada' ORDER BY updated_at DESC LIMIT 1",
      args: [email],
    });
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async list(filter: { statuses?: ConversationStatus[]; assignedAnalyst?: string } = {}): Promise<Conversation[]> {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.statuses?.length) {
      where.push(`status IN (${filter.statuses.map(() => "?").join(", ")})`);
      args.push(...filter.statuses);
    }
    if (filter.assignedAnalyst) {
      where.push("assigned_analyst = ?");
      args.push(filter.assignedAnalyst);
    }
    const { rows } = await this.db.execute({
      sql: `SELECT * FROM conversations ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC`,
      args,
    });
    return rows.map(toConversation);
  }

  async update(id: string, patch: ConversationPatch): Promise<Conversation> {
    const entries = Object.entries(patch) as [keyof ConversationPatch, unknown][];
    const sets = entries.map(([k]) => `${COLUMNS[k].column} = ?`);
    const args = entries.map(([k, v]) => COLUMNS[k].encode(v));
    await this.db.execute({
      sql: `UPDATE conversations SET ${[...sets, "updated_at = ?"].join(", ")} WHERE id = ?`,
      args: [...args, this.clock().toISOString(), id],
    });
    return this.require(id);
  }

  /** Grava a mensagem; mensagem do funcionário também soma no limite da sessão. */
  async appendMessage(conversationId: string, msg: NewMessage): Promise<Message> {
    const id = randomUUID();
    const ts = this.clock().toISOString();
    await this.db.batch(
      [
        {
          sql: `INSERT INTO messages (id, conversation_id, seq, role, author_name, content, meta, created_at)
                VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?), ?, ?, ?, ?, ?)`,
          args: [id, conversationId, conversationId, msg.role, msg.authorName ?? null, msg.content, JSON.stringify(msg.meta ?? {}), ts],
        },
        {
          sql: `UPDATE conversations SET updated_at = ?,
                  employee_message_count = employee_message_count + ? WHERE id = ?`,
          args: [ts, msg.role === "employee" ? 1 : 0, conversationId],
        },
      ],
      "write",
    );
    const { rows } = await this.db.execute({ sql: "SELECT * FROM messages WHERE id = ?", args: [id] });
    return toMessage(rows[0]!);
  }

  /** Mensagens em ordem cronológica; com `last`, só as N mais recentes. */
  async listMessages(conversationId: string, opts: { last?: number } = {}): Promise<Message[]> {
    const { rows } = opts.last
      ? await this.db.execute({
          sql: `SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?) ORDER BY seq ASC`,
          args: [conversationId, opts.last],
        })
      : await this.db.execute({ sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC", args: [conversationId] });
    return rows.map(toMessage);
  }
}
