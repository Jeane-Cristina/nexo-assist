import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";

/**
 * libSQL fala o mesmo protocolo para arquivo SQLite local e para o Turso.
 * Assim o "rodar local" e o deploy usam exatamente o mesmo código.
 */
export function createDb(url: string, authToken?: string): Client {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    mkdirSync(dirname(path), { recursive: true });
  }
  return createClient(authToken ? { url, authToken } : { url });
}

export async function migrate(db: Client): Promise<void> {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS employees (
        email TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('employee', 'analyst')),
        device TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS tickets (
        number TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        impact TEXT NOT NULL,
        requester_email TEXT NOT NULL REFERENCES employees(email),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_support_update_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        assignee TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_email)`,
      `CREATE TABLE IF NOT EXISTS ticket_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL REFERENCES tickets(number),
        kind TEXT NOT NULL,
        actor TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_number)`,
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        requester_email TEXT NOT NULL,
        ticket_number TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL
      )`,
    ],
    "write",
  );
}
