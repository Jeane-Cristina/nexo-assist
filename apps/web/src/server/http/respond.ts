import { ZodError } from "zod";
import { ChatError } from "../chat/employee-chat";

export function errorResponse(err: unknown): Response {
  if (err instanceof ChatError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return Response.json({ error: "Requisição inválida." }, { status: 400 });
  console.error("[api] erro inesperado", err);
  return Response.json({ error: "Algo deu errado. Tente de novo." }, { status: 500 });
}
