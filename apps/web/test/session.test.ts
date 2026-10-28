import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession, samePassword } from "../src/server/auth/session";

const SECRET = "s".repeat(32);
const ANA = { email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee" as const };

describe("sessão em cookie assinado", () => {
  it("ida e volta preserva os dados", () => {
    expect(decodeSession(encodeSession(ANA, SECRET), SECRET)).toMatchObject(ANA);
  });

  it("cookie adulterado (trocar o e-mail) é rejeitado", () => {
    const token = encodeSession(ANA, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...ANA, email: "carla.mendes@nexo.com.br", exp: 9_999_999_999 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("promover-se a analista editando o cookie não funciona", () => {
    const token = encodeSession(ANA, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...ANA, role: "analyst", exp: 9_999_999_999 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("outra chave de assinatura não vale", () => {
    expect(decodeSession(encodeSession(ANA, SECRET), "x".repeat(32))).toBeNull();
  });

  it("sessão expirada é rejeitada", () => {
    const token = encodeSession(ANA, SECRET, new Date("2026-10-27T08:00:00Z"));
    expect(decodeSession(token, SECRET, new Date("2026-10-28T08:00:00Z"))).toBeNull();
  });

  it("lixo no cookie não derruba nada", () => {
    expect(decodeSession("abc", SECRET)).toBeNull();
    expect(decodeSession(undefined, SECRET)).toBeNull();
  });

  it("compara senha", () => {
    expect(samePassword("nexo123", "nexo123")).toBe(true);
    expect(samePassword("nexo124", "nexo123")).toBe(false);
  });
});
