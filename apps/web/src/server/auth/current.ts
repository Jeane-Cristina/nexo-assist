import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "../env";
import { decodeSession, SESSION_COOKIE, type Session } from "./session";

/**
 * Quem está logado. É a ÚNICA fonte de identidade do app: rotas e telas nunca
 * confiam em e-mail vindo do navegador.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value, env().SESSION_SECRET);
}

/** Para páginas: sem sessão (ou papel errado) → volta para o login. */
export async function requireSession(role: Session["role"]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(homeFor(session.role));
  return session;
}

export const homeFor = (role: Session["role"]): string => (role === "analyst" ? "/console" : "/atendimento");

/** Para rotas de API: sem sessão (ou papel errado) → 401/403 em JSON. */
export async function sessionOrError(role: Session["role"]): Promise<{ session: Session } | { error: Response }> {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (session.role !== role) return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}
