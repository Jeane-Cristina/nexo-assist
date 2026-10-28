import { describe, expect, it } from "vitest";
import { TicketsClient, TicketsError } from "../src/server/tickets/client";

const ACTOR = { email: "ana.souza@nexo.com.br", role: "employee" as const };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function clientWith(responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const sleeps: number[] = [];
  const client = new TicketsClient({
    baseUrl: "http://legacy",
    serviceToken: "x".repeat(16),
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("sem resposta roteirizada");
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, calls, sleeps };
}

describe("cliente do serviço de chamados", () => {
  it("repete quando o legado responde 503 e respeita o retry-after", async () => {
    const { client, calls, sleeps } = clientWith([
      json(503, { error: "legacy_unavailable" }, { "retry-after": "1" }),
      json(200, { results: [] }),
    ]);
    await expect(client.searchKnowledgeBase(ACTOR, "vpn")).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it("desiste depois de 3 tentativas com erro tipado 'unavailable'", async () => {
    const { client, calls } = clientWith([json(503, { error: "legacy_unavailable" }), json(503, { error: "legacy_unavailable" }), json(503, { error: "legacy_unavailable" })]);
    const err = await client.searchKnowledgeBase(ACTOR, "vpn").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TicketsError);
    expect((err as TicketsError).kind).toBe("unavailable");
    expect(calls).toHaveLength(3);
  });

  it("não repete POST sem idempotência quando a rede cai (pode já ter sido processado)", async () => {
    const { client, calls } = clientWith([new Error("ECONNRESET"), json(200, {})]);
    await expect(client.addUpdate(ACTOR, "INC-1", "complemento")).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("repete POST com chave de idempotência e envia a chave", async () => {
    const ticket = {
      number: "INC-20413", type: "INC", title: "t", description: "d", category: "Rede e VPN", priority: "alta", impact: "individual",
      requesterEmail: ACTOR.email, status: "aguardando_analista", createdAt: "x", lastSupportUpdateAt: "x", updatedAt: "x",
      resolvedAt: null, assignee: null, isOpen: true, canReopen: false, sla: { label: "4 horas úteis", dueAt: "x", overdue: false },
    };
    const { client, calls } = clientWith([new Error("ECONNRESET"), json(200, { ticket, replayed: true })]);
    const r = await client.createTicket(ACTOR, { type: "INC", title: "t", description: "d", category: "Rede e VPN", priority: "alta", impact: "individual" }, "conv:D-381");
    expect(r.replayed).toBe(true);
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[1]?.init?.headers).get("idempotency-key")).toBe("conv:D-381");
  });

  it("erro de regra de negócio não é repetido e mantém o código", async () => {
    const { client, calls } = clientWith([json(409, { error: "reopen_window_expired", message: "Resolvido há mais de 7 dias." })]);
    await expect(client.reopen(ACTOR, "INC-19877", "de novo")).rejects.toMatchObject({ kind: "conflict", code: "reopen_window_expired" });
    expect(calls).toHaveLength(1);
  });
});
