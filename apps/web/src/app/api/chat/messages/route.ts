import { z } from "zod";
import { sessionOrError } from "@/server/auth/current";
import { sendMessage } from "@/server/chat/employee-chat";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";

export const maxDuration = 60;

const Body = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request) {
  const auth = await sessionOrError("employee");
  if ("error" in auth) return auth.error;
  try {
    const body = Body.parse(await req.json());
    return Response.json(await sendMessage(await getContainer(), auth.session, body));
  } catch (err) {
    return errorResponse(err);
  }
}
