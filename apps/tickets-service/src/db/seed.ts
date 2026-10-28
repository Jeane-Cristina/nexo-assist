import type { Client, InStatement } from "@libsql/client";
import { ARTICLES, EMPLOYEES, TICKETS } from "./seed-data";

const DAY = 24 * 60 * 60_000;

/** Popula o banco só se ele estiver vazio — seguro chamar a cada boot. */
export async function seedIfEmpty(db: Client, now: Date = new Date()): Promise<boolean> {
  const { rows } = await db.execute("SELECT COUNT(*) AS n FROM employees");
  if (Number(rows[0]?.n ?? 0) > 0) return false;
  await seed(db, now);
  return true;
}

export async function seed(db: Client, now: Date): Promise<void> {
  const ago = (days: number): string => new Date(now.getTime() - days * DAY).toISOString();
  const statements: InStatement[] = [];

  for (const e of EMPLOYEES) {
    statements.push({
      sql: "INSERT INTO employees (email, name, department, role, device) VALUES (?, ?, ?, ?, ?)",
      args: [e.email, e.name, e.department, e.role, e.device],
    });
  }

  for (const t of TICKETS) {
    const lastEventDays = Math.min(...t.events.map((e) => e.daysAgo), t.createdDaysAgo);
    statements.push({
      sql: `INSERT INTO tickets (number, type, title, description, category, priority, impact, requester_email,
              status, created_at, last_support_update_at, updated_at, resolved_at, assignee)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        t.number,
        t.type,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.impact,
        t.requesterEmail,
        t.status,
        ago(t.createdDaysAgo),
        ago(t.lastSupportUpdateDaysAgo),
        ago(lastEventDays),
        t.resolvedDaysAgo === null ? null : ago(t.resolvedDaysAgo),
        t.assignee,
      ],
    });
    for (const ev of t.events) {
      statements.push({
        sql: "INSERT INTO ticket_events (ticket_number, kind, actor, message, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [t.number, ev.kind, ev.actor, ev.message, ago(ev.daysAgo)],
      });
    }
  }

  for (const a of ARTICLES) {
    statements.push({
      sql: "INSERT INTO articles (id, title, body, category, tags) VALUES (?, ?, ?, ?, ?)",
      args: [a.id, a.title, a.body, a.category, JSON.stringify(a.tags)],
    });
  }

  await db.batch(statements, "write");
}

export async function wipe(db: Client): Promise<void> {
  await db.batch(
    ["DROP TABLE IF EXISTS ticket_events", "DROP TABLE IF EXISTS tickets", "DROP TABLE IF EXISTS articles", "DROP TABLE IF EXISTS employees"],
    "write",
  );
}
