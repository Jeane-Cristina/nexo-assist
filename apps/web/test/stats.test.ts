import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStats, touchPresence } from "../src/server/stats";
import { createTestEnv, type TestEnv } from "./helpers";

/** Métricas da tela de login, calculadas dos dados reais. */

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(() => env.cleanup());

const db = () => env.appDb;

describe("métricas do service desk", () => {
  it("sem dados, não inventa número", async () => {
    expect(await getStats(db())).toEqual({ avgFirstResponseSeconds: null, resolvedWithoutQueuePct: null, analystsOnline: 0 });
  });

  it("calcula 1ª resposta média e % resolvidos sem fila", async () => {
    // relógio do ambiente de teste anda 1s por leitura: cada resposta leva ~1s
    const a = await env.store.create({ email: "a@nexo.com.br", name: "A" });
    await env.store.appendMessage(a.id, { role: "employee", content: "oi" });
    await env.store.appendMessage(a.id, { role: "agent", content: "olá" });
    const b = await env.store.create({ email: "b@nexo.com.br", name: "B" });
    await env.store.appendMessage(b.id, { role: "employee", content: "quero analista" });
    await env.store.appendMessage(b.id, { role: "agent", content: "ok" });
    await env.store.appendMessage(b.id, { role: "system", content: "Transferida para um analista · pedido" });
    const s = await getStats(db());
    expect(s.avgFirstResponseSeconds).toBeGreaterThan(0);
    expect(s.resolvedWithoutQueuePct).toBe(50);
  });

  it("analista conta como online por 2 minutos depois da última atividade", async () => {
    const now = new Date("2026-10-28T13:00:00Z");
    await touchPresence(db(), "rafael.lima@nexo.com.br", now);
    expect((await getStats(db(), new Date(now.getTime() + 60_000))).analystsOnline).toBe(1);
    expect((await getStats(db(), new Date(now.getTime() + 3 * 60_000))).analystsOnline).toBe(0);
  });
});
