import { defineConfig, devices } from "@playwright/test";

const TOKEN = "e2e-service-token-1234567890";
const DATA = ".e2e";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: `node -e "require('fs').rmSync('${DATA}',{recursive:true,force:true});require('fs').mkdirSync('${DATA}')" && pnpm --dir ../tickets-service exec tsx src/index.ts`,
      url: "http://localhost:4100/health",
      reuseExistingServer: false,
      env: {
        PORT: "4100",
        SERVICE_TOKEN: TOKEN,
        TICKETS_DB_URL: `file:../web/${DATA}/tickets.db`,
        LEGACY_FAILURE_RATE: "0",
        LEGACY_MAX_LATENCY_MS: "0",
      },
    },
    {
      command: "pnpm exec next dev --port 3100",
      url: "http://localhost:3100/login",
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        LLM_MODEL: "demo/roteiro",
        TICKETS_SERVICE_URL: "http://localhost:4100",
        SERVICE_TOKEN: TOKEN,
        APP_DB_URL: `file:./${DATA}/app.db`,
        SESSION_SECRET: "e2e-session-secret-com-mais-de-32-caracteres",
        DEMO_PASSWORD: "nexo123",
      },
    },
  ],
});
