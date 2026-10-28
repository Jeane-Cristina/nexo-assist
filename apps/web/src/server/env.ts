import { z } from "zod";

const EnvSchema = z.object({
  LLM_MODEL: z.string().regex(/^[a-z0-9-]+\/.+$/, "use o formato provedor/modelo").default("google/gemini-3.5-flash-lite"),
  LLM_FALLBACK_MODEL: z.string().regex(/^[a-z0-9-]+\/.+$/, "use o formato provedor/modelo").optional(),
  TICKETS_SERVICE_URL: z.string().url().default("http://localhost:4000"),
  SERVICE_TOKEN: z.string().min(16, "SERVICE_TOKEN precisa ter pelo menos 16 caracteres"),
  APP_DB_URL: z.string().default("file:./data/app.db"),
  APP_DB_AUTH_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter pelo menos 32 caracteres"),
  DEMO_PASSWORD: z.string().min(4).default("nexo123"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida do app web:\n${problems}\nVeja apps/web/.env.example`);
  }
  cached = parsed.data;
  return cached;
}
