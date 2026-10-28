import { z } from "zod";
import { BLOCKING_LEVELS } from "@/server/agent/triage";
import { sessionOrError } from "@/server/auth/current";
import { pendingAction } from "@/server/chat/employee-chat";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/respond";
import { Category, Impact } from "@/server/tickets/schemas";

const Body = z.object({
  conversationId: z.string().min(1),
  pendingId: z.string().min(1),
  action: z.enum(["confirm", "cancel", "edit"]),
  edits: z
    .object({
      title: z.string().trim().min(5).max(90),
      description: z.string().trim().min(10).max(600),
      category: Category,
      impact: Impact,
      blocking: z.enum(BLOCKING_LEVELS),
      deadlineToday: z.boolean(),
    })
    .partial()
    .optional(),
});

/** Botões do cartão de rascunho: Confirmar, Cancelar, Editar. */
export async function POST(req: Request) {
  const auth = await sessionOrError("employee");
  if ("error" in auth) return auth.error;
  try {
    const body = Body.parse(await req.json());
    return Response.json(await pendingAction(await getContainer(), auth.session, body));
  } catch (err) {
    return errorResponse(err);
  }
}
