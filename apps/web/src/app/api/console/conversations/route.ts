import { sessionOrError } from "@/server/auth/current";
import { CONSOLE_FILTERS, listConversations, type ConsoleFilter } from "@/server/chat/analyst-console";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";
import { touchPresence } from "@/server/stats";

export const dynamic = "force-dynamic";

/** Lista de conversas do console, com filtro (?filter=para_voce) e busca (?q=). */
export async function GET(req: Request) {
  const auth = await sessionOrError("analyst");
  if ("error" in auth) return auth.error;
  const params = new URL(req.url).searchParams;
  const raw = params.get("filter") ?? "para_voce";
  const filter: ConsoleFilter = (CONSOLE_FILTERS as readonly string[]).includes(raw) ? (raw as ConsoleFilter) : "para_voce";
  try {
    const container = await getContainer();
    await touchPresence(container.db, auth.session.email);
    return Response.json(await listConversations(container, auth.session, { filter, query: params.get("q") ?? undefined }));
  } catch (err) {
    return errorResponse(err);
  }
}
