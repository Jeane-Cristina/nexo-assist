import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MastraModelConfig } from "@mastra/core/llm";
import { MockLanguageModelV3 } from "ai/test";
// Integração de verdade: o agent conversa com o serviço de chamados real, em memória.
import { createDb, migrate } from "../../tickets-service/src/db/client";
import { Repository } from "../../tickets-service/src/db/repository";
import { seed } from "../../tickets-service/src/db/seed";
import { TicketService } from "../../tickets-service/src/domain/tickets";
import { createApp } from "../../tickets-service/src/http/app";
import { createInstability } from "../../tickets-service/src/http/legacy-instability";
import type { TurnDeps } from "../src/server/agent/run-turn";
import { ConversationStore } from "../src/server/conversations/store";
import { createAppDb, migrateAppDb } from "../src/server/db";
import { ServiceDesk } from "../src/server/service-desk";
import { TicketsClient } from "../src/server/tickets/client";
import type { Employee } from "../src/server/tickets/schemas";

export const TOKEN = "token-de-teste-com-16+chars";
/** Quarta-feira, 28/10/2026, 10h em Brasília. */
export const NOW = new Date("2026-10-28T13:00:00.000Z");

export const ANA: Employee = {
  email: "ana.souza@nexo.com.br",
  name: "Ana Souza",
  department: "Financeiro",
  role: "employee",
  device: "Notebook Dell Latitude · Windows 11",
};

// ---------------------------------------------------------------------------
// Modelo roteirizado: cada chamada ao modelo devolve o próximo passo do roteiro.

export type ToolCallSpec = { tool: string; args: Record<string, unknown> };
/** Um passo: chamadas de ferramenta, ou texto final. Pode depender do estado (ex.: id do rascunho). */
export type ScriptStep = ToolCallSpec[] | string | (() => ToolCallSpec[] | string | Promise<ToolCallSpec[] | string>);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

export function scriptedModel(script: ScriptStep[] | (() => never)) {
  const queue = Array.isArray(script) ? [...script] : [];
  const prompts: unknown[] = [];
  let id = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      if (!Array.isArray(script)) script();
      const next = queue.shift();
      if (next === undefined) throw new Error("Roteiro do modelo acabou: o agent chamou o modelo mais vezes que o esperado");
      const step = typeof next === "function" ? await next() : next;
      if (typeof step === "string") {
        return { content: [{ type: "text", text: step }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
      }
      return {
        content: step.map((c) => ({ type: "tool-call" as const, toolCallId: `call-${++id}`, toolName: c.tool, input: JSON.stringify(c.args) })),
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  // O mock do pacote "ai" e o Mastra trazem cópias diferentes dos tipos do provider;
  // em runtime o contrato é o mesmo (LanguageModelV3), daí o cast.
  return { model: model as unknown as MastraModelConfig, prompts, remaining: () => queue.length };
}

export const decision = (intencao: string, confianca: number, extra: Record<string, unknown> = {}): ToolCallSpec => ({
  tool: "registrar_decisao",
  args: { intencao, acao: "Ação de teste", confianca, motivo: "Motivo de teste", ...extra },
});

// ---------------------------------------------------------------------------
// Ambiente completo: serviço de chamados + banco do app, em arquivos temporários.

export type TestEnv = Awaited<ReturnType<typeof createTestEnv>>;

export async function createTestEnv(opts: { legacyDown?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nexo-web-test-"));
  const ticketsDb = createDb(`file:${join(dir, "tickets.db")}`);
  await migrate(ticketsDb);
  await seed(ticketsDb, NOW);
  const instability = createInstability({ failureRate: opts.legacyDown ? 1 : 0, maxLatencyMs: 0 });
  const legacy = createApp({ service: new TicketService(new Repository(ticketsDb), () => NOW), serviceToken: TOKEN, instability });

  const tickets = new TicketsClient({
    baseUrl: "http://tickets.test",
    serviceToken: TOKEN,
    fetch: ((url: string, init?: RequestInit) => legacy.request(url.replace("http://tickets.test", ""), init)) as typeof fetch,
    sleep: async () => undefined,
  });

  const appDb = createAppDb(`file:${join(dir, "app.db")}`);
  await migrateAppDb(appDb);
  // Relógio que anda 1s a cada leitura: turnos distintos têm instantes distintos,
  // como na vida real (importa para a regra "não confirmar no mesmo turno").
  let ticks = 0;
  const clock = () => new Date(NOW.getTime() + ticks++ * 1000);
  const store = new ConversationStore(appDb, clock);
  const desk = new ServiceDesk(tickets, store, clock);

  return {
    appDb,
    tickets,
    store,
    desk,
    legacy,
    deps: (model: TurnDeps["model"], fallbackModel?: TurnDeps["model"]): TurnDeps => ({
      model,
      ...(fallbackModel ? { fallbackModel } : {}),
      store,
      desk,
      tickets,
      clock,
    }),
    cleanup: () => {
      ticketsDb.close();
      appDb.close();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        /* Windows pode segurar o arquivo; a pasta temporária é descartável */
      }
    },
  };
}
