import type { Priority } from "./types";

/**
 * Prazos do Anexo A.
 *
 * - Crítica: 1 hora corrida (chamados críticos têm plantão 24h — artigo da central).
 * - Alta: 4 horas úteis.
 * - Média: 3 dias úteis.
 * - Baixa: 5 dias úteis.
 *
 * Expediente: segunda a sexta, 8h às 18h, horário de Brasília.
 * O prazo vale para a primeira resposta e para cada atualização, então ele é
 * sempre contado a partir da última atualização do suporte.
 *
 * Limitação consciente: feriados não são considerados (ficaria numa tabela
 * de calendário com mais tempo).
 */

export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
/** America/Sao_Paulo não tem horário de verão desde 2019, então o offset é fixo. */
const TZ_OFFSET_MINUTES = -3 * 60;
const MINUTE = 60_000;

type SlaRule =
  | { kind: "wall_clock_minutes"; amount: number; label: string }
  | { kind: "business_minutes"; amount: number; label: string }
  | { kind: "business_days"; amount: number; label: string };

export const SLA_RULES: Record<Priority, SlaRule> = {
  critica: { kind: "wall_clock_minutes", amount: 60, label: "1 hora" },
  alta: { kind: "business_minutes", amount: 4 * 60, label: "4 horas úteis" },
  media: { kind: "business_days", amount: 3, label: "3 dias úteis" },
  baixa: { kind: "business_days", amount: 5, label: "5 dias úteis" },
};

/*
 * Truque para trabalhar em horário local sem biblioteca de timezone:
 * deslocamos o instante pelo offset e usamos os getters UTC como se fossem
 * os campos do relógio de Brasília. No fim, desfazemos o deslocamento.
 */
const toLocal = (d: Date): Date => new Date(d.getTime() + TZ_OFFSET_MINUTES * MINUTE);
const fromLocal = (d: Date): Date => new Date(d.getTime() - TZ_OFFSET_MINUTES * MINUTE);

const isWeekday = (local: Date): boolean => {
  const day = local.getUTCDay();
  return day !== 0 && day !== 6;
};

const atHour = (local: Date, hour: number): Date => {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

const nextDay = (local: Date): Date => {
  const d = new Date(local);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

/** Leva um instante (local) para o próximo momento dentro do expediente. */
function normalizeToBusinessTime(local: Date): Date {
  let d = new Date(local);
  if (isWeekday(d) && d.getUTCHours() < BUSINESS_START_HOUR) {
    return atHour(d, BUSINESS_START_HOUR);
  }
  if (isWeekday(d) && d.getUTCHours() < BUSINESS_END_HOUR) {
    return d;
  }
  d = atHour(nextDay(d), BUSINESS_START_HOUR);
  while (!isWeekday(d)) d = nextDay(d);
  return d;
}

export function addBusinessMinutes(start: Date, minutes: number): Date {
  let cursor = normalizeToBusinessTime(toLocal(start));
  let remaining = minutes;
  for (;;) {
    const endOfDay = atHour(cursor, BUSINESS_END_HOUR);
    const available = (endOfDay.getTime() - cursor.getTime()) / MINUTE;
    if (remaining <= available) {
      return fromLocal(new Date(cursor.getTime() + remaining * MINUTE));
    }
    remaining -= available;
    cursor = normalizeToBusinessTime(atHour(nextDay(cursor), 0));
  }
}

/** Soma dias úteis mantendo o horário (normalizado para dentro do expediente). */
export function addBusinessDays(start: Date, days: number): Date {
  let cursor = normalizeToBusinessTime(toLocal(start));
  let added = 0;
  while (added < days) {
    cursor = nextDay(cursor);
    if (isWeekday(cursor)) added += 1;
  }
  return fromLocal(cursor);
}

export function computeDueAt(priority: Priority, from: Date): Date {
  const rule = SLA_RULES[priority];
  switch (rule.kind) {
    case "wall_clock_minutes":
      return new Date(from.getTime() + rule.amount * MINUTE);
    case "business_minutes":
      return addBusinessMinutes(from, rule.amount);
    case "business_days":
      return addBusinessDays(from, rule.amount);
  }
}

export type SlaView = {
  label: string;
  dueAt: string;
  overdue: boolean;
};

export function slaFor(priority: Priority, lastSupportUpdateAt: Date, isOpen: boolean, now: Date): SlaView {
  const dueAt = computeDueAt(priority, lastSupportUpdateAt);
  return {
    label: SLA_RULES[priority].label,
    dueAt: dueAt.toISOString(),
    overdue: isOpen && now.getTime() > dueAt.getTime(),
  };
}
