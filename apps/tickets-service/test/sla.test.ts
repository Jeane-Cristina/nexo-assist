import { describe, expect, it } from "vitest";
import { canReopen, isOpen } from "../src/domain/rules";
import { addBusinessMinutes, computeDueAt, slaFor } from "../src/domain/sla";

const br = (isoLocal: string): Date => new Date(`${isoLocal}-03:00`);
const iso = (isoLocal: string): string => br(isoLocal).toISOString();

describe("prazo de prioridade alta (4 horas úteis)", () => {
  it("soma dentro do mesmo dia", () => {
    expect(computeDueAt("alta", br("2026-10-28T10:00:00")).toISOString()).toBe(iso("2026-10-28T14:00:00"));
  });

  it("vira para o dia seguinte quando passa das 18h", () => {
    expect(computeDueAt("alta", br("2026-10-28T17:00:00")).toISOString()).toBe(iso("2026-10-29T11:00:00"));
  });

  it("pula o fim de semana", () => {
    expect(computeDueAt("alta", br("2026-10-30T16:00:00")).toISOString()).toBe(iso("2026-11-02T10:00:00"));
  });

  it("aberto no sábado começa a contar na segunda às 8h", () => {
    expect(computeDueAt("alta", br("2026-10-31T10:00:00")).toISOString()).toBe(iso("2026-11-02T12:00:00"));
  });

  it("aberto antes do expediente começa a contar às 8h", () => {
    expect(addBusinessMinutes(br("2026-10-28T06:00:00"), 240).toISOString()).toBe(iso("2026-10-28T12:00:00"));
  });
});

describe("prazos em dias úteis", () => {
  it("média: 3 dias úteis atravessando o fim de semana", () => {
    expect(computeDueAt("media", br("2026-10-28T10:00:00")).toISOString()).toBe(iso("2026-11-02T10:00:00"));
  });

  it("baixa: 5 dias úteis", () => {
    expect(computeDueAt("baixa", br("2026-10-28T10:00:00")).toISOString()).toBe(iso("2026-11-04T10:00:00"));
  });

  it("aberto sexta à noite conta a partir de segunda 8h", () => {
    expect(computeDueAt("media", br("2026-10-30T19:00:00")).toISOString()).toBe(iso("2026-11-05T08:00:00"));
  });
});

describe("prioridade crítica", () => {
  it("é 1 hora corrida, inclusive de madrugada no fim de semana (plantão 24h)", () => {
    expect(computeDueAt("critica", br("2026-10-31T03:00:00")).toISOString()).toBe(iso("2026-10-31T04:00:00"));
  });
});

describe("chamado vencido", () => {
  const now = br("2026-10-28T10:00:00");

  it("média sem atualização há 6 dias está vencida", () => {
    const sla = slaFor("media", br("2026-10-22T10:00:00"), true, now);
    expect(sla.overdue).toBe(true);
    expect(sla.label).toBe("3 dias úteis");
  });

  it("chamado encerrado nunca aparece como vencido", () => {
    expect(slaFor("media", br("2026-10-01T10:00:00"), false, now).overdue).toBe(false);
  });

  it("dentro do prazo não está vencido", () => {
    expect(slaFor("alta", br("2026-10-28T09:00:00"), true, now).overdue).toBe(false);
  });
});

describe("reabertura (janela de 7 dias)", () => {
  const now = br("2026-10-28T10:00:00");

  it("resolvido há 4 dias pode ser reaberto", () => {
    expect(canReopen({ status: "resolvido", resolvedAt: iso("2026-10-24T10:00:00") }, now)).toBe(true);
  });

  it("resolvido há 8 dias vira chamado novo", () => {
    expect(canReopen({ status: "resolvido", resolvedAt: iso("2026-10-20T10:00:00") }, now)).toBe(false);
  });

  it("chamado aberto não é 'reaberto', é atualizado", () => {
    expect(canReopen({ status: "em_andamento", resolvedAt: null }, now)).toBe(false);
    expect(isOpen({ status: "em_andamento" })).toBe(true);
    expect(isOpen({ status: "resolvido" })).toBe(false);
  });
});
