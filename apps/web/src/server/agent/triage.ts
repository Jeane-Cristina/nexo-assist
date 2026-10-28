import type { Impact, Priority } from "../tickets/schemas";

export const BLOCKING_LEVELS = ["parado", "atrapalha", "sem_urgencia"] as const;
export type Blocking = (typeof BLOCKING_LEVELS)[number];

export type TriageInput = {
  impact: Impact;
  blocking: Blocking;
  deadlineToday: boolean;
};

export type TriageResult = {
  priority: Priority;
  rule: string;
};

export function classifyPriority({ impact, blocking, deadlineToday }: TriageInput): TriageResult {
  const today = deadlineToday ? " e há um compromisso hoje que depende disso" : "";
  if (blocking === "parado" && impact !== "individual") {
    return { priority: "critica", rule: `Está parado para ${impact === "empresa" ? "a empresa" : "uma equipe"}${today}.` };
  }
  if (blocking === "parado") {
    return { priority: "alta", rule: `Impede você de trabalhar${today}.` };
  }
  if (deadlineToday) {
    return { priority: "alta", rule: "Há um compromisso hoje que depende disso." };
  }
  if (blocking === "atrapalha") {
    return { priority: "media", rule: "Atrapalha, mas há alternativa." };
  }
  return { priority: "baixa", rule: "Pedido ou melhoria sem urgência." };
}
