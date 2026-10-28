import { describe, expect, it } from "vitest";
import { splitQuestion } from "../src/components/chat/messages";

describe("pergunta em destaque na resposta do agent", () => {
  it("separa a última frase quando é pergunta", () => {
    expect(splitQuestion("O artigo vale só para Windows 10. Quem está sendo afetado?")).toEqual({
      body: "O artigo vale só para Windows 10.",
      question: "Quem está sendo afetado?",
    });
  });
  it("separa o último parágrafo", () => {
    expect(splitQuestion("Vou abrir um chamado.\n\nQuem está sendo afetado?").question).toBe("Quem está sendo afetado?");
  });
  it("não mexe quando a mensagem é só a pergunta ou não termina em pergunta", () => {
    expect(splitQuestion("Quer que eu chame um analista?")).toEqual({ body: "Quer que eu chame um analista?", question: null });
    expect(splitQuestion("Pronto, chamado criado.")).toEqual({ body: "Pronto, chamado criado.", question: null });
  });
});
