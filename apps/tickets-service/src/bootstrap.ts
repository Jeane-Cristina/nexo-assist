import type { Config } from "./config";
import { createDb, migrate } from "./db/client";
import { Repository } from "./db/repository";
import { seedIfEmpty } from "./db/seed";
import { TicketService } from "./domain/tickets";
import { createApp } from "./http/app";
import { createInstability } from "./http/legacy-instability";

export async function bootstrap(config: Config) {
  const db = createDb(config.TICKETS_DB_URL, config.TICKETS_DB_AUTH_TOKEN);
  await migrate(db);
  const seeded = await seedIfEmpty(db);
  const service = new TicketService(new Repository(db));
  const instability = createInstability({
    failureRate: config.LEGACY_FAILURE_RATE,
    maxLatencyMs: config.LEGACY_MAX_LATENCY_MS,
  });
  const app = createApp({ service, serviceToken: config.SERVICE_TOKEN, instability });
  return { app, db, seeded };
}
