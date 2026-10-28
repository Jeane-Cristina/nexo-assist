import { serve } from "@hono/node-server";
import { bootstrap } from "./bootstrap";
import { loadConfig } from "./config";

const config = loadConfig();
const { app, seeded } = await bootstrap(config);

if (seeded) console.log("[tickets-service] banco vazio: dados de exemplo criados.");

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(
    `[tickets-service] ouvindo em http://localhost:${info.port} ` +
      `(falha simulada: ${Math.round(config.LEGACY_FAILURE_RATE * 100)}%, latência até ${config.LEGACY_MAX_LATENCY_MS}ms)`,
  );
});
