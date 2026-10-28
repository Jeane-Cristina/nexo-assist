import type { Priority, TicketStatus } from "@/server/tickets/schemas";

export const PRIORITY_DOT: Record<Priority, string> = {
  critica: "bg-danger",
  alta: "bg-warning",
  media: "bg-ink/40",
  baixa: "bg-ink/25",
};

export const STATUS_DOT: Record<TicketStatus, string> = {
  aguardando_analista: "bg-warning",
  em_andamento: "bg-info",
  em_atendimento: "bg-primary",
  aprovado: "bg-success",
  resolvido: "bg-ink/25",
  cancelado: "bg-ink/25",
};

export function Dot({ className, size = 6 }: { className: string; size?: number }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ width: size, height: size }} aria-hidden />;
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-[14.5px] font-medium [&>span]:whitespace-nowrap">{children}</span>
    </div>
  );
}
