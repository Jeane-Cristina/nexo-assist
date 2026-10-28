import { sessionOrError } from "@/server/auth/current";
import { loadChat } from "@/server/chat/employee-chat";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";

export const dynamic = "force-dynamic";

/** Estado atual do chat do funcionário logado (usado no carregamento e no polling). */
export async function GET() {
  const auth = await sessionOrError("employee");
  if ("error" in auth) return auth.error;
  try {
    return Response.json(await loadChat(await getContainer(), auth.session));
  } catch (err) {
    return errorResponse(err);
  }
}
