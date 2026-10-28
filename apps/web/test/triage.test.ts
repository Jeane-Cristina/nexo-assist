import { describe, expect, it } from "vitest";
import { classifyPriority } from "../src/server/agent/triage";

describe("prioridade = impacto × urgência", () => {
  it("parado para a equipe é crítica", () => {
    expect(classifyPriority({ impact: "equipe", blocking: "parado", deadlineToday: false }).priority).toBe("critica");
  });

  it("parado para a empresa é crítica", () => {
    expect(classifyPriority({ impact: "empresa", blocking: "parado", deadlineToday: false }).priority).toBe("critica");
  });

  it("parado só para a pessoa é alta", () => {
    expect(classifyPriority({ impact: "individual", blocking: "parado", deadlineToday: false }).priority).toBe("alta");
  });

  it("compromisso hoje sobe para alta mesmo havendo alternativa (caso da VPN antes da reunião)", () => {
    const r = classifyPriority({ impact: "individual", blocking: "atrapalha", deadlineToday: true });
    expect(r).toEqual({ priority: "alta", rule: "Há um compromisso hoje que depende disso." });
  });

  it("a regra cita todos os fatos que pesaram (parado + compromisso hoje)", () => {
    expect(classifyPriority({ impact: "individual", blocking: "parado", deadlineToday: true })).toEqual({
      priority: "alta",
      rule: "Impede você de trabalhar e há um compromisso hoje que depende disso.",
    });
  });

  it("atrapalha com alternativa é média, mesmo para a equipe", () => {
    expect(classifyPriority({ impact: "equipe", blocking: "atrapalha", deadlineToday: false }).priority).toBe("media");
  });

  it("pedido sem urgência é baixa", () => {
    expect(classifyPriority({ impact: "individual", blocking: "sem_urgencia", deadlineToday: false }).priority).toBe("baixa");
  });
});
