import { cookies } from "next/headers";
import { z } from "zod";
import { homeFor } from "@/server/auth/current";
import { encodeSession, REMEMBER_TTL_SECONDS, samePassword, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { env } from "@/server/env";
import { TicketsError } from "@/server/tickets/client";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  remember: z.boolean().default(true),
});

/**
 * Login de demonstração: e-mail corporativo existente + senha de demonstração.
 * A mensagem de erro é a mesma para e-mail e senha errados, para não revelar
 * quais e-mails existem.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
  const { email, password, remember } = parsed.data;
  const invalid = Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });

  if (!samePassword(password, env().DEMO_PASSWORD)) return invalid;

  const { tickets } = await getContainer();
  let employee;
  try {
    employee = await tickets.getEmployee({ email, role: "employee" }, email);
  } catch (err) {
    if (err instanceof TicketsError && err.kind === "not_found") return invalid;
    if (err instanceof TicketsError && err.kind === "unavailable") {
      return Response.json({ error: "O sistema está instável agora. Tente de novo em instantes." }, { status: 503 });
    }
    throw err;
  }

  // Manter conectado: cookie persistente por 7 dias. Sem marcar: cookie de sessão
  // (some ao fechar o navegador) e validade de um expediente.
  const ttl = remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    encodeSession({ email: employee.email, name: employee.name, role: employee.role, department: employee.department }, env().SESSION_SECRET, new Date(), ttl),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(remember ? { maxAge: ttl } : {}),
    },
  );
  return Response.json({ redirect: homeFor(employee.role) });
}
