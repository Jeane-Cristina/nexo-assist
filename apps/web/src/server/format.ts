/** Formatação de datas no fuso do service desk (Brasília), independente do fuso do servidor. */

const TZ = "America/Sao_Paulo";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "13:43" */
export const formatTime = (iso: string | Date): string => timeFmt.format(new Date(iso));

/** "16 out" */
export const formatDay = (iso: string | Date): string => dayFmt.format(new Date(iso)).replace(".", "").replace(" de ", " ");

/** "16 out, 14:20" */
export const formatDayTime = (iso: string | Date): string => `${formatDay(iso)}, ${formatTime(iso)}`;

/** "quarta-feira, 28 de outubro de 2026 às 10:00" — usado no contexto do agent. */
export const formatFull = (d: Date): string => fullFmt.format(d);

const sameDay = (a: Date, b: Date): boolean => dayKeyFmt.format(a) === dayKeyFmt.format(b);

/** "hoje às 13:43" / "amanhã às 11:00" / "02 nov às 10:00" — para prazos. */
export function formatDeadline(iso: string, now: Date): string {
  const d = new Date(iso);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  if (sameDay(d, now)) return `hoje às ${formatTime(d)}`;
  if (sameDay(d, tomorrow)) return `amanhã às ${formatTime(d)}`;
  return `${formatDay(d)} às ${formatTime(d)}`;
}

/** "há 5 dias" / "há 3 horas" / "agora há pouco" */
export function formatAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** "até 13:43" (hoje) / "até amanhã, 11:40" / "até 02 nov, 10:00" — prazo curto, como no protótipo. */
export function formatUntil(iso: string, now: Date): string {
  const d = new Date(iso);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  if (sameDay(d, now)) return `até ${formatTime(d)}`;
  if (sameDay(d, tomorrow)) return `até amanhã, ${formatTime(d)}`;
  return `até ${formatDay(d)}, ${formatTime(d)}`;
}
