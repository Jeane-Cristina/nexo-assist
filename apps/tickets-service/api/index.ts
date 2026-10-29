import { bootstrap } from "../src/bootstrap";
import { loadConfig } from "../src/config";

type App = Awaited<ReturnType<typeof bootstrap>>["app"];

let app: Promise<App> | undefined;

async function handler(request: Request): Promise<Response> {
  app ??= bootstrap(loadConfig()).then((r) => r.app);
  return (await app).fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
