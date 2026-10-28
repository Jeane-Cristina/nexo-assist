import type { Client } from "@libsql/client";
import type { TurnDeps } from "./agent/run-turn";
import { ConversationStore } from "./conversations/store";
import { createAppDb, migrateAppDb } from "./db";
import { env } from "./env";
import { ServiceDesk } from "./service-desk";
import { TicketsClient } from "./tickets/client";

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
  return {
    db,
    model: e.LLM_MODEL,
    ...(e.LLM_FALLBACK_MODEL ? { fallbackModel: e.LLM_FALLBACK_MODEL } : {}),
    store,
    desk,
    tickets,
    clock,
  };
}
