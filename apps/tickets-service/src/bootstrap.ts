import type { Config } from "./config.js";
import { createDb, migrate } from "./db/client.js";
import { Repository } from "./db/repository.js";
import { seedIfEmpty } from "./db/seed.js";
import { TicketService } from "./domain/tickets.js";
import { createApp } from "./http/app.js";
import { createInstability } from "./http/legacy-instability.js";

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
