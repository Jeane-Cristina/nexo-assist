import { z } from "zod";
import { sessionOrError } from "@/server/auth/current";
import { sendAnalystMessage } from "@/server/chat/analyst-console";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";

const Body = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await sessionOrError("analyst");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const { text } = Body.parse(await req.json());
    return Response.json({ message: await sendAnalystMessage(await getContainer(), auth.session, id, text) });
  } catch (err) {
    return errorResponse(err);
  }
}
