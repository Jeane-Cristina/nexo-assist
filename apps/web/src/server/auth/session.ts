import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Sessão em cookie assinado (HMAC-SHA256), sem estado no servidor.
 *
 * - O conteúdo é visível (base64), mas não pode ser alterado: qualquer mudança
 *   invalida a assinatura. Por isso a Ana não consegue "virar" a Carla editando o cookie.
 * - O cookie é httpOnly: o JavaScript da página não lê, o que protege contra roubo via XSS.
 * - É a mesma ideia de um JWT, sem a biblioteca.
 */

export const SESSION_COOKIE = "nexo_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // um expediente

export const Session = z.object({
  email: z.string(),
  name: z.string(),
  role: z.enum(["employee", "analyst"]),
  /** Expiração em segundos desde a época. */
  exp: z.number(),
});
export type Session = z.infer<typeof Session>;

const sign = (payload: string, secret: string): string => createHmac("sha256", secret).update(payload).digest("base64url");

export function encodeSession(data: Omit<Session, "exp">, secret: string, now: Date = new Date()): string {
  const session: Session = { ...data, exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSession(token: string | undefined, secret: string, now: Date = new Date()): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const session = Session.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return session.exp * 1000 > now.getTime() ? session : null;
  } catch {
    return null;
  }
}

/** Comparação de senha em tempo constante (evita descobrir a senha medindo o tempo de resposta). */
export function samePassword(given: string, expected: string): boolean {
  const a = createHmac("sha256", "cmp").update(given).digest();
  const b = createHmac("sha256", "cmp").update(expected).digest();
  return timingSafeEqual(a, b);
}
