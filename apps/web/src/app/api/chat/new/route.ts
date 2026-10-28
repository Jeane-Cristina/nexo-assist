import { z } from "zod";
import { sessionOrError } from "@/server/auth/current";
import { startNewConversation } from "@/server/chat/employee-chat";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";

const Body = z.object({ conversationId: z.string().min(1) });

export async function POST(req: Request) {
  const auth = await sessionOrError("employee");
  if ("error" in auth) return auth.error;
  try {
    const { conversationId } = Body.parse(await req.json());
    return Response.json(await startNewConversation(await getContainer(), auth.session, conversationId));
  } catch (err) {
    return errorResponse(err);
  }
}
