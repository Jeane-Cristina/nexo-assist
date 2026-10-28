import { sessionOrError } from "@/server/auth/current";
import { takeOver } from "@/server/chat/analyst-console";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await sessionOrError("analyst");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    return Response.json({ conversation: await takeOver(await getContainer(), auth.session, id) });
  } catch (err) {
    return errorResponse(err);
  }
}
