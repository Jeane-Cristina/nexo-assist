import type { Impact, Priority } from "../tickets/schemas";

/**
 * Classificação de prioridade (Anexo A): impacto × urgência.
 *
 * Decisão de projeto: o LLM coleta os FATOS (quem é afetado, se está parado,
 * se há compromisso hoje) e o CÓDIGO aplica a tabela. Assim a prioridade é
 * reproduzível, testável e explicável — o modelo não "acha" que é alta.
 *
 * | Prioridade | Quando usar                                                         |
 * | Crítica    | Algo parado para uma equipe ou para a empresa                       |
 * | Alta       | Impede uma pessoa de trabalhar, ou há compromisso no mesmo dia      |
 * | Média      | Atrapalha, mas há alternativa                                       |
 * | Baixa      | Pedidos e melhorias sem urgência                                    |
 */

export const BLOCKING_LEVELS = ["parado", "atrapalha", "sem_urgencia"] as const;
export type Blocking = (typeof BLOCKING_LEVELS)[number];

export type TriageInput = {
  impact: Impact;
  /** "parado": não consegue trabalhar · "atrapalha": há alternativa · "sem_urgencia": pedido/melhoria. */
  blocking: Blocking;
  /** Há um compromisso hoje que depende disso (reunião, entrega, fechamento). */
  deadlineToday: boolean;
};

export type TriageResult = {
  priority: Priority;
  /** Regra aplicada, em linguagem do funcionário — vai para o painel de transparência. */
  rule: string;
};

export function classifyPriority({ impact, blocking, deadlineToday }: TriageInput): TriageResult {
  if (blocking === "parado" && impact !== "individual") {
    return { priority: "critica", rule: `Está parado para ${impact === "empresa" ? "a empresa" : "uma equipe"}.` };
  }
  if (blocking === "parado") {
    return { priority: "alta", rule: "Impede você de trabalhar." };
  }
  if (deadlineToday) {
    return { priority: "alta", rule: "Há um compromisso hoje que depende disso." };
  }
  if (blocking === "atrapalha") {
    return { priority: "media", rule: "Atrapalha, mas há alternativa." };
  }
  return { priority: "baixa", rule: "Pedido ou melhoria sem urgência." };
}
