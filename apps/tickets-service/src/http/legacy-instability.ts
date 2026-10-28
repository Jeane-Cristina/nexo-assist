import type { MiddlewareHandler } from "hono";

export type InstabilityOptions = {
  failureRate: number;
  maxLatencyMs: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type Instability = {
  middleware: MiddlewareHandler;
  forceOutage: (seconds: number) => number;
};

export function createInstability(opts: InstabilityOptions): Instability {
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  let outageUntil = 0;

  const unavailable = (retryAfterSeconds: number) =>
    new Response(JSON.stringify({ error: "legacy_unavailable", message: "Sistema de chamados indisponível no momento." }), {
      status: 503,
      headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
    });

  const middleware: MiddlewareHandler = async (_c, next) => {
    if (opts.maxLatencyMs > 0) await sleep(Math.floor(random() * opts.maxLatencyMs));
    if (now() < outageUntil) return unavailable(Math.ceil((outageUntil - now()) / 1000));
    if (random() < opts.failureRate) return unavailable(1);
    await next();
  };

  return {
    middleware,
    forceOutage: (seconds: number) => {
      outageUntil = now() + seconds * 1000;
      return outageUntil;
    },
  };
}
