import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, migrate } from "../src/db/client.js";
import { Repository } from "../src/db/repository.js";
import { seed } from "../src/db/seed.js";
import { TicketService } from "../src/domain/tickets.js";
import { createApp } from "../src/http/app.js";
import { createInstability } from "../src/http/legacy-instability.js";

const TOKEN = "token-de-teste-com-16+chars";
const ANA = "ana.souza@nexo.com.br";
const CARLA = "carla.mendes@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";
const NOW = new Date("2026-10-28T13:00:00.000Z");

let dir: string;
let testIndex = 0;
let db: Client;
let app: ReturnType<typeof createApp>;
let instability: ReturnType<typeof createInstability>;
let advanceClock: (ms: number) => void;

type Opts = { actor?: string; role?: "employee" | "analyst"; body?: unknown; method?: string; token?: string };

async function call(path: string, opts: Opts = {}) {
  const res = await app.request(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      "x-service-token": opts.token ?? TOKEN,
      "x-actor-email": opts.actor ?? ANA,
      "x-actor-role": opts.role ?? "employee",
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tickets-test-"));
});

beforeEach(async () => {
  testIndex += 1;
  db = createDb(`file:${join(dir, `test-${testIndex}.db`)}`);
  await migrate(db);
  await seed(db, NOW);
  let fakeNow = NOW.getTime();
  instability = createInstability({ failureRate: 0, maxLatencyMs: 0, now: () => fakeNow });
  app = createApp({ service: new TicketService(new Repository(db), () => NOW), serviceToken: TOKEN, instability });
  advanceClock = (ms) => {
    fakeNow += ms;
  };
});

afterEach(() => {
  db.close();
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
  }
});

describe("autenticação entre serviços", () => {
  it("recusa chamada sem o token do app web", async () => {
    const { status } = await call("/tickets", { token: "errado" });
    expect(status).toBe(401);
  });
});

describe("consulta de chamados", () => {
  it("lista só os chamados abertos da própria pessoa, com prazo calculado", async () => {
    const { status, json } = await call("/tickets");
    expect(status).toBe(200);
    const numbers = json.tickets.map((t: any) => t.number);
    expect(numbers).toEqual(expect.arrayContaining(["INC-20311", "INC-20298", "REQ-10442"]));
    expect(numbers).not.toContain("INC-20412");
    expect(numbers).not.toContain("INC-20150");
    const lento = json.tickets.find((t: any) => t.number === "INC-20311");
    expect(lento.sla).toMatchObject({ label: "3 dias úteis", overdue: true });
  });

  it("scope=all inclui resolvidos e marca o que ainda pode ser reaberto", async () => {
    const { json } = await call("/tickets?scope=all");
    const sap = json.tickets.find((t: any) => t.number === "INC-20150");
    expect(sap).toMatchObject({ status: "resolvido", canReopen: true });
    const outlook = json.tickets.find((t: any) => t.number === "INC-19877");
    expect(outlook.canReopen).toBe(false);
  });

  it("privacidade: chamado de outra pessoa responde 404, sem revelar que existe", async () => {
    const { status, json } = await call("/tickets/INC-20412");
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("analista enxerga o chamado de qualquer funcionário", async () => {
    const { status } = await call("/tickets/INC-20412", { actor: RAFAEL, role: "analyst" });
    expect(status).toBe(200);
  });

  it("detalhe traz o histórico de eventos", async () => {
    const { json } = await call("/tickets/inc-20311");
    expect(json.ticket.number).toBe("INC-20311");
    expect(json.ticket.events.length).toBeGreaterThan(0);
  });
});

describe("abertura e atualização", () => {
  const vpn = {
    type: "INC",
    title: "VPN não conecta no notebook — erro 809",
    description: "Desde ontem o notebook com Windows 11 não conecta na VPN e mostra o erro 809.",
    category: "Rede e VPN",
    priority: "alta",
    impact: "individual",
  };

  it("cria chamado com número sequencial e prazo de 4 horas úteis", async () => {
    const { status, json } = await call("/tickets", { body: vpn });
    expect(status).toBe(201);
    expect(json.ticket.number).toBe("INC-20413");
    expect(json.ticket.status).toBe("aguardando_analista");
    expect(json.ticket.sla).toMatchObject({ label: "4 horas úteis", overdue: false, dueAt: "2026-10-28T17:00:00.000Z" });
  });

  it("mesma chave de idempotência não cria chamado duplicado (retry seguro)", async () => {
    const send = () =>
      app.request("/tickets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-service-token": TOKEN,
          "x-actor-email": ANA,
          "x-actor-role": "employee",
          "idempotency-key": "D-381",
        },
        body: JSON.stringify(vpn),
      });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = (await first.json()) as any;
    const b = (await second.json()) as any;
    expect(b.replayed).toBe(true);
    expect(b.ticket.number).toBe(a.ticket.number);
    const { json } = await call("/tickets");
    expect(json.tickets.filter((t: any) => t.title === vpn.title)).toHaveLength(1);
  });

  it("prévia do prazo usa a mesma regra de SLA", async () => {
    const { json } = await call("/sla/preview?priority=alta");
    expect(json.sla).toEqual({ label: "4 horas úteis", dueAt: "2026-10-28T17:00:00.000Z" });
  });

  it("valida o corpo e devolve erro legível", async () => {
    const { status, json } = await call("/tickets", { body: { ...vpn, priority: "urgentissima" } });
    expect(status).toBe(400);
    expect(json.error).toBe("validation");
  });

  it("complemento do funcionário não reinicia o prazo (o suporte ainda não respondeu)", async () => {
    const before = await call("/tickets/INC-20311");
    const { json } = await call("/tickets/INC-20311/updates", { body: { message: "Agora trava ao abrir o Excel também." } });
    expect(json.ticket.sla.dueAt).toBe(before.json.ticket.sla.dueAt);
    expect(json.ticket.sla.overdue).toBe(true);
  });

  it("atualização do analista reinicia o prazo", async () => {
    const { json } = await call("/tickets/INC-20311/updates", {
      actor: RAFAEL,
      role: "analyst",
      body: { message: "Vou verificar o driver de vídeo remotamente." },
    });
    expect(json.ticket.sla.overdue).toBe(false);
  });

  it("não deixa complementar chamado de outra pessoa", async () => {
    const { status } = await call("/tickets/INC-20412/updates", { body: { message: "oi" + "!".repeat(5) } });
    expect(status).toBe(404);
  });

  it("reclassifica a prioridade registrando o motivo", async () => {
    const { json } = await call("/tickets/INC-20311/classification", {
      method: "PATCH",
      body: { priority: "alta", reason: "Agora impede a funcionária de trabalhar." },
    });
    expect(json.ticket.priority).toBe("alta");
    const detail = await call("/tickets/INC-20311");
    expect(detail.json.ticket.events.at(-1)).toMatchObject({ kind: "reclassificado" });
  });
});

describe("reabertura (sem duplicidade)", () => {
  it("reabre chamado resolvido há 4 dias", async () => {
    const { status, json } = await call("/tickets/INC-20150/reopen", { body: { message: "O SAP bloqueou de novo." } });
    expect(status).toBe(200);
    expect(json.ticket).toMatchObject({ status: "aguardando_analista", resolvedAt: null });
  });

  it("recusa reabrir chamado resolvido há mais de 7 dias", async () => {
    const { status, json } = await call("/tickets/INC-19877/reopen", { body: { message: "Parou de novo." } });
    expect(status).toBe(409);
    expect(json.error).toBe("reopen_window_expired");
  });

  it("complementar chamado encerrado devolve ticket_closed", async () => {
    const { status, json } = await call("/tickets/INC-20150/updates", { body: { message: "Bloqueou de novo." } });
    expect(status).toBe(409);
    expect(json.error).toBe("ticket_closed");
  });
});

describe("transferência e atendimento", () => {
  it("transfere registrando o resumo para o analista", async () => {
    const { json } = await call("/tickets/INC-20298/transfer", { body: { summary: "Funcionária pediu analista: aguarda há 14 dias." } });
    expect(json.ticket.status).toBe("aguardando_analista");
    const detail = await call("/tickets/INC-20298");
    expect(detail.json.ticket.events.at(-1)).toMatchObject({ kind: "transferido" });
  });

  it("funcionário não muda status; analista sim", async () => {
    const asAna = await call("/tickets/INC-20311/status", { method: "PATCH", body: { status: "resolvido", message: "ok" } });
    expect(asAna.status).toBe(403);
    const asRafael = await call("/tickets/INC-20311/status", {
      method: "PATCH",
      actor: RAFAEL,
      role: "analyst",
      body: { status: "em_atendimento", message: "Assumido." },
    });
    expect(asRafael.json.ticket).toMatchObject({ status: "em_atendimento", assignee: RAFAEL });
  });
});

describe("central de ajuda", () => {
  it("acha o artigo do erro 809 pela descrição do problema", async () => {
    const { json } = await call(`/kb/search?q=${encodeURIComponent("meu notebook não conecta na VPN, erro 809")}`);
    expect(json.results[0].article.id).toBe("KB-001");
  });
});

describe("legado instável", () => {
  it("fica indisponível na janela forçada e volta depois", async () => {
    await app.request("/admin/outage", {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-token": TOKEN },
      body: JSON.stringify({ seconds: 5 }),
    });
    const down = await call("/tickets");
    expect(down.status).toBe(503);
    expect(down.json.error).toBe("legacy_unavailable");
    advanceClock(6000);
    const up = await call("/tickets");
    expect(up.status).toBe(200);
  });

  it("falha aleatória respeita a taxa configurada", async () => {
    const always = createInstability({ failureRate: 1, maxLatencyMs: 0 });
    const flaky = createApp({ service: new TicketService(new Repository(db), () => NOW), serviceToken: TOKEN, instability: always });
    const res = await flaky.request("/tickets", {
      headers: { "x-service-token": TOKEN, "x-actor-email": ANA, "x-actor-role": "employee" },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("1");
  });
});

describe("funcionários", () => {
  it("funcionário só consulta o próprio cadastro", async () => {
    expect((await call(`/employees/${ANA}`)).status).toBe(200);
    expect((await call(`/employees/${CARLA}`)).status).toBe(404);
  });
});
