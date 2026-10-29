import type { Priority } from "./types.js";

export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
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
