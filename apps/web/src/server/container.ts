import type { Client } from "@libsql/client";
import type { TurnDeps } from "./agent/run-turn";
import { ConversationStore } from "./conversations/store";
import { createAppDb, migrateAppDb } from "./db";
import { env } from "./env";
import { ServiceDesk } from "./service-desk";
import { TicketsClient } from "./tickets/client";

/**
 * Composição das dependências do app (um "container" simples, sem framework de DI).
 * Criado uma vez por processo e reaproveitado entre requisições.
 */

export type Container = TurnDeps & { db: Client };

let containerPromise: Promise<Container> | undefined;

export function getContainer(): Promise<Container> {
  containerPromise ??= build();
  return containerPromise;
}

async function build(): Promise<Container> {
  const e = env();
  const db = createAppDb(e.APP_DB_URL, e.APP_DB_AUTH_TOKEN);
  await migrateAppDb(db);
  const clock = () => new Date();
  const tickets = new TicketsClient({ baseUrl: e.TICKETS_SERVICE_URL, serviceToken: e.SERVICE_TOKEN });
  const store = new ConversationStore(db, clock);
  const desk = new ServiceDesk(tickets, store, clock);
  // "google/gemini-2.5-flash": o roteador de modelos do Mastra resolve o provedor e lê a chave do ambiente.
  return { db, model: e.LLM_MODEL as TurnDeps["model"], store, desk, tickets, clock };
}
