import { z } from "zod";
import {
  ArticleMatch,
  Employee,
  Ticket,
  TicketDetail,
  type Category,
  type Impact,
  type Priority,
  type TicketStatus,
  type TicketType,
} from "./schemas";

/**
 * Cliente do serviço de chamados (o "sistema legado").
 *
 * O PRD avisa que ele fica indisponível por alguns segundos de vez em quando.
 * Estratégia:
 * - timeout por tentativa, para não prender o funcionário esperando;
 * - retry com backoff exponencial só para falhas transitórias (503/502/504, rede, timeout);
 * - POST só é repetido quando é seguro: o legado respondeu 503 antes de processar,
 *   ou a requisição leva chave de idempotência;
 * - quando as tentativas acabam, sobe um erro tipado (`unavailable`) que o agent
 *   transforma numa resposta honesta para o funcionário.
 */

export type Actor = { email: string; role: "employee" | "analyst" };

export type TicketsErrorKind = "unavailable" | "not_found" | "conflict" | "forbidden" | "validation" | "unknown";

export class TicketsError extends Error {
  constructor(
    readonly kind: TicketsErrorKind,
    /** Código estável devolvido pelo serviço (ex.: reopen_window_expired). */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TicketsError";
  }
}

export type NewTicketInput = {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  impact: Impact;
};

export type RetryPolicy = { attempts: number; baseDelayMs: number; maxDelayMs: number; timeoutMs: number };

export const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseDelayMs: 400, maxDelayMs: 2000, timeoutMs: 4000 };

type ClientOptions = {
  baseUrl: string;
  serviceToken: string;
  retry?: RetryPolicy;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const ErrorBody = z.object({ error: z.string(), message: z.string().optional() }).passthrough();

const KIND_BY_STATUS: Record<number, TicketsErrorKind> = { 400: "validation", 403: "forbidden", 404: "not_found", 409: "conflict" };

export class TicketsClient {
  private readonly retry: RetryPolicy;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ClientOptions) {
    this.retry = opts.retry ?? DEFAULT_RETRY;
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async getEmployee(actor: Actor, email: string): Promise<Employee> {
    const data = await this.request(actor, "GET", `/employees/${encodeURIComponent(email)}`);
    return z.object({ employee: Employee }).parse(data).employee;
  }

  async listTickets(actor: Actor, opts: { scope: "open" | "all"; requester?: string }): Promise<Ticket[]> {
    const qs = new URLSearchParams({ scope: opts.scope, ...(opts.requester ? { requester: opts.requester } : {}) });
    const data = await this.request(actor, "GET", `/tickets?${qs}`);
    return z.object({ tickets: z.array(Ticket) }).parse(data).tickets;
  }

  async getTicket(actor: Actor, number: string): Promise<TicketDetail> {
    const data = await this.request(actor, "GET", `/tickets/${encodeURIComponent(number)}`);
    return z.object({ ticket: TicketDetail }).parse(data).ticket;
  }

  async createTicket(actor: Actor, input: NewTicketInput, idempotencyKey: string): Promise<{ ticket: Ticket; replayed: boolean }> {
    const data = await this.request(actor, "POST", "/tickets", input, idempotencyKey);
    return z.object({ ticket: Ticket, replayed: z.boolean() }).parse(data);
  }

  async addUpdate(actor: Actor, number: string, message: string): Promise<Ticket> {
    return this.ticketCall(actor, "POST", `/tickets/${encodeURIComponent(number)}/updates`, { message });
  }

  async reclassify(
    actor: Actor,
    number: string,
    changes: { priority?: Priority; impact?: Impact; category?: Category },
    reason: string,
  ): Promise<Ticket> {
    return this.ticketCall(actor, "PATCH", `/tickets/${encodeURIComponent(number)}/classification`, { ...changes, reason });
  }

  async reopen(actor: Actor, number: string, message: string): Promise<Ticket> {
    return this.ticketCall(actor, "POST", `/tickets/${encodeURIComponent(number)}/reopen`, { message });
  }

  async transfer(actor: Actor, number: string, summary: string): Promise<Ticket> {
    return this.ticketCall(actor, "POST", `/tickets/${encodeURIComponent(number)}/transfer`, { summary });
  }

  async setStatus(actor: Actor, number: string, status: TicketStatus, message: string): Promise<Ticket> {
    return this.ticketCall(actor, "PATCH", `/tickets/${encodeURIComponent(number)}/status`, { status, message });
  }

  async searchKnowledgeBase(actor: Actor, query: string): Promise<ArticleMatch[]> {
    const data = await this.request(actor, "GET", `/kb/search?q=${encodeURIComponent(query)}`);
    return z.object({ results: z.array(ArticleMatch) }).parse(data).results;
  }

  async previewSla(actor: Actor, priority: Priority): Promise<{ label: string; dueAt: string }> {
    const data = await this.request(actor, "GET", `/sla/preview?priority=${priority}`);
    return z.object({ sla: z.object({ label: z.string(), dueAt: z.string() }) }).parse(data).sla;
  }

  private async ticketCall(actor: Actor, method: string, path: string, body: unknown): Promise<Ticket> {
    const data = await this.request(actor, method, path, body);
    return z.object({ ticket: Ticket }).parse(data).ticket;
  }

  private async request(actor: Actor, method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<unknown> {
    const { attempts, baseDelayMs, maxDelayMs, timeoutMs } = this.retry;
    let lastError: TicketsError | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            "x-service-token": this.opts.serviceToken,
            "x-actor-email": actor.email,
            "x-actor-role": actor.role,
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        // Rede/timeout: não sabemos se o servidor processou. Só repete se for seguro.
        lastError = new TicketsError("unavailable", "network", "Não foi possível falar com o sistema de chamados.");
        if (method !== "GET" && !idempotencyKey) break;
        if (attempt < attempts) await this.sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
        continue;
      }

      if (res.ok) return res.json();

      const parsed = ErrorBody.safeParse(await res.json().catch(() => ({})));
      const code = parsed.success ? parsed.data.error : `http_${res.status}`;
      const message = (parsed.success && parsed.data.message) || `O sistema de chamados respondeu ${res.status}.`;

      if (res.status === 503 || res.status === 502 || res.status === 504) {
        lastError = new TicketsError("unavailable", code, message);
        // 503 do legado acontece antes de processar: repetir é seguro mesmo em POST.
        const safeToRetry = method === "GET" || res.status === 503 || Boolean(idempotencyKey);
        if (!safeToRetry) break;
        if (attempt < attempts) {
          const retryAfter = Number(res.headers.get("retry-after")) * 1000;
          const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
          await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, maxDelayMs) : backoff);
        }
        continue;
      }

      throw new TicketsError(KIND_BY_STATUS[res.status] ?? "unknown", code, message);
    }

    throw lastError ?? new TicketsError("unavailable", "unknown", "Sistema de chamados indisponível.");
  }
}
