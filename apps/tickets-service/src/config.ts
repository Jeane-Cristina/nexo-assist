import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  SERVICE_TOKEN: z.string().min(16, "SERVICE_TOKEN precisa ter pelo menos 16 caracteres"),
  TICKETS_DB_URL: z.string().default("file:./data/tickets.db"),
  TICKETS_DB_AUTH_TOKEN: z.string().optional(),
  LEGACY_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  LEGACY_MAX_LATENCY_MS: z.coerce.number().int().min(0).default(600),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida do tickets-service:\n${problems}\nVeja apps/tickets-service/.env.example`);
  }
  return parsed.data;
}
