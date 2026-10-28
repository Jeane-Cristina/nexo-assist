import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";

/** Mesmo protocolo para SQLite local e Turso (deploy). */
export function createAppDb(url: string, authToken?: string): Client {
  if (url.startsWith("file:")) mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  return createClient(authToken ? { url, authToken } : { url });
}

export async function migrateAppDb(db: Client): Promise<void> {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        employee_email TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_analyst TEXT,
        transfer TEXT,
        focus_ticket TEXT,
        pending_action TEXT,
        employee_message_count INTEGER NOT NULL DEFAULT 0,
        last_confidence REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_employee ON conversations(employee_email, updated_at)`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        author_name TEXT,
        content TEXT NOT NULL,
        meta TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, seq)`,
      // Presença dos analistas (atualizada pelo console a cada poucos segundos).
      `CREATE TABLE IF NOT EXISTS analyst_presence (
        email TEXT PRIMARY KEY,
        last_seen TEXT NOT NULL
      )`,
    ],
    "write",
  );
}
