import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { z, ZodError } from "zod";
import { DomainError } from "../domain/errors";
import type { Actor, TicketService } from "../domain/tickets";
import { ActorRole, Category, Impact, Priority, TicketStatus, TicketType } from "../domain/types";
import type { Instability } from "./legacy-instability";

type Env = { Variables: { actor: Actor } };

export type AppDeps = {
  service: TicketService;
  serviceToken: string;
  instability: Instability;
};

const CreateTicketBody = z.object({
  type: TicketType,
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(2000),
  category: Category,
  priority: Priority,
  impact: Impact,
});

const MessageBody = z.object({ message: z.string().trim().min(2).max(2000) });
const TransferBody = z.object({ summary: z.string().trim().min(10).max(2000) });
const ReclassifyBody = z
  .object({
    priority: Priority.optional(),
    impact: Impact.optional(),
    category: Category.optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .refine((b) => b.priority ?? b.impact ?? b.category, { message: "Informe ao menos um campo para reclassificar." });
const StatusBody = z.object({ status: TicketStatus, message: z.string().trim().min(2).max(2000) });
const OutageBody = z.object({ seconds: z.number().int().min(1).max(120) });

const sameSecret = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw: unknown = await c.req.json().catch(() => ({}));
  return schema.parse(raw);
}

export function createApp({ service, serviceToken, instability }: AppDeps) {
  const app = new Hono<Env>();

  app.get("/health", (c) => c.json({ ok: true }));

  // 1) Só o app web conversa com este serviço: token compartilhado em header.
  app.use("*", async (c, next) => {
    const token = c.req.header("x-service-token") ?? "";
    if (!sameSecret(token, serviceToken)) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  // Rota de demonstração: força a indisponibilidade do "legado" por N segundos.
  app.post("/admin/outage", async (c) => {
    const { seconds } = await body(c, OutageBody);
    const until = instability.forceOutage(seconds);
    return c.json({ ok: true, outageUntil: new Date(until).toISOString() });
  });

  // 2) Daqui para baixo, o serviço se comporta como um legado instável.
  app.use("*", instability.middleware);

  // 3) Toda chamada diz em nome de quem está sendo feita.
  app.use("*", async (c, next) => {
    const email = c.req.header("x-actor-email");
    const role = ActorRole.safeParse(c.req.header("x-actor-role") ?? "employee");
    if (!email || !role.success) return c.json({ error: "missing_actor", message: "Informe x-actor-email e x-actor-role." }, 400);
    c.set("actor", { email: email.toLowerCase(), role: role.data });
    await next();
  });

  app.get("/employees", async (c) => {
    if (c.get("actor").role !== "analyst") throw new DomainError("forbidden", "Somente analistas listam funcionários.");
    return c.json({ employees: await service.listEmployees() });
  });

  app.get("/employees/:email", async (c) => {
    const actor = c.get("actor");
    const email = c.req.param("email").toLowerCase();
    if (actor.role === "employee" && actor.email !== email) throw new DomainError("not_found", "Funcionário não encontrado.");
    return c.json({ employee: await service.getEmployee(email) });
  });

  app.get("/tickets", async (c) => {
    const scope = c.req.query("scope") === "all" ? "all" : "open";
    const requester = c.req.query("requester");
    const tickets = await service.listTickets(c.get("actor"), { scope, ...(requester ? { requesterEmail: requester } : {}) });
    return c.json({ tickets });
  });

  app.get("/tickets/:number", async (c) => c.json({ ticket: await service.getTicket(c.get("actor"), c.req.param("number")) }));

  app.post("/tickets", async (c) => {
    const ticket = await service.createTicket(c.get("actor"), await body(c, CreateTicketBody));
    return c.json({ ticket }, 201);
  });

  app.post("/tickets/:number/updates", async (c) => {
    const { message } = await body(c, MessageBody);
    return c.json({ ticket: await service.addUpdate(c.get("actor"), c.req.param("number"), message) });
  });

  app.patch("/tickets/:number/classification", async (c) => {
    const { reason, ...changes } = await body(c, ReclassifyBody);
    return c.json({ ticket: await service.reclassify(c.get("actor"), c.req.param("number"), changes, reason) });
  });

  app.post("/tickets/:number/reopen", async (c) => {
    const { message } = await body(c, MessageBody);
    return c.json({ ticket: await service.reopen(c.get("actor"), c.req.param("number"), message) });
  });

  app.post("/tickets/:number/transfer", async (c) => {
    const { summary } = await body(c, TransferBody);
    return c.json({ ticket: await service.transfer(c.get("actor"), c.req.param("number"), summary) });
  });

  app.patch("/tickets/:number/status", async (c) => {
    const { status, message } = await body(c, StatusBody);
    return c.json({ ticket: await service.setStatus(c.get("actor"), c.req.param("number"), status, message) });
  });

  app.get("/kb/search", async (c) => {
    const q = c.req.query("q") ?? "";
    return c.json({ results: await service.searchKnowledgeBase(q) });
  });

  app.notFound((c) => c.json({ error: "route_not_found" }, 404));

  // Erros viram respostas com código estável — o cliente decide pelo `error`, não pela mensagem.
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ error: err.code, message: err.message }, err.httpStatus as 403 | 404 | 409);
    }
    if (err instanceof ZodError) {
      return c.json({ error: "validation", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    }
    console.error("[tickets-service] erro inesperado", err);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
