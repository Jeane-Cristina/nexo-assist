"use client";

import { Bot, ChevronRight, Inbox } from "lucide-react";
import type { ConversationDetail } from "@/server/chat/analyst-console";
import { TRANSFER_REASON_LABEL } from "@/server/conversations/types";
import { formatAgo, formatDay, formatDeadline } from "@/server/format";
import { PRIORITY_LABEL, STATUS_LABEL, type Ticket } from "@/server/tickets/schemas";
import type { Message } from "@/server/conversations/types";
import { formatTime } from "@/server/format";
import { Dot, STATUS_DOT } from "../ui";
import { systemIcon } from "../timeline-icons";

/**
 * Coluna da direita: o que o analista precisa saber antes de responder —
 * o resumo que o agent deixou na transferência e os chamados da pessoa.
 */
export function TicketPanel({ detail }: { detail: ConversationDetail }) {
  const { conversation: c, tickets } = detail;
  const first = c.employeeName.split(" ")[0];
  const now = new Date();
  const open = tickets?.filter((t) => t.isOpen) ?? [];
  const closed = tickets?.filter((t) => !t.isOpen) ?? [];
  const current = tickets?.find((t) => t.number === c.focusTicket) ?? null;
  const others = (tickets ?? []).filter((t) => t.number !== c.focusTicket);
  // Último marco da conversa (transferida, assumida...) — o "Last Event" do protótipo.
  const lastEvent = [...detail.messages].reverse().find((m) => m.role === "system") ?? null;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-white">
      <header className="flex h-16 shrink-0 flex-col justify-center border-b border-line px-5">
        <span className="text-[15.5px] font-semibold">Chamados de {first}</span>
        <span className="text-[12.5px] text-muted">{tickets ? `${open.length} abertos · ${closed.length} encerrados` : "Sistema de chamados indisponível"}</span>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-5 pt-6 pb-5">
        {c.transfer && (
          <section className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-muted">Resumo do agent</span>
            <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-tint p-3.5 text-[13px] leading-[19px]">
              <span className="flex items-center gap-1.5 font-semibold text-warning-ink">
                <Bot className="size-3.5" />
                {TRANSFER_REASON_LABEL[c.transfer.reason]}
                {c.transfer.confidence !== null && ` · confiança ${Math.round(c.transfer.confidence * 100)}%`}
              </span>
              <span className="text-body">{c.transfer.summary}</span>
              <span className="text-[12px] text-muted">Transferida {formatAgo(c.transfer.at, now)}</span>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <span className="text-[12.5px] font-semibold text-muted">Desta conversa</span>
          {current ? (
            <CurrentTicket ticket={current} lastEvent={lastEvent} />
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-surface p-4">
              <Inbox className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold">{c.focusTicket ? c.focusTicket : "Nenhum chamado nesta conversa"}</span>
                <span className="text-[12.5px] leading-[18px] text-muted">
                  {c.focusTicket
                    ? "Sistema de chamados indisponível agora."
                    : "O agent ainda não consultou nem abriu um chamado aqui. Os chamados da pessoa estão logo abaixo."}
                </span>
              </span>
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-muted">Outros chamados</span>
            {others.map((t) => (
              <div key={t.number} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                <Dot className={`self-start mt-1.5 ${STATUS_DOT[t.status]}`} size={7} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[14.5px] font-medium">{t.title}</span>
                  <span className="text-[12.5px] text-muted">
                    {t.number} · {t.isOpen ? STATUS_LABEL[t.status] : `${STATUS_LABEL[t.status]} em ${formatDay(t.resolvedAt ?? t.updatedAt)}`}
                    {t.sla.overdue && <span className="text-warning-ink"> · vencido</span>}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

function CurrentTicket({ ticket: t, lastEvent }: { ticket: Ticket; lastEvent: Message | null }) {
  const EventIcon = lastEvent ? systemIcon(lastEvent.content) : null;
  const now = new Date();
  return (
    <div className="flex flex-col gap-3.5 rounded-xl bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center text-[12.5px]">
          <span className="font-medium text-muted">{t.number}</span>
          <span className="ml-auto flex items-center gap-1.5 font-semibold text-body">
            <Dot className={STATUS_DOT[t.status]} size={7} />
            {STATUS_LABEL[t.status]}
          </span>
        </span>
        <span className="text-[15.5px] leading-5 font-semibold">{t.title}</span>
        <span className="text-[13.5px] text-muted">
          {t.category} · prioridade {PRIORITY_LABEL[t.priority].toLowerCase()}
        </span>
      </div>
      {lastEvent && (
        <span className="flex items-center gap-2 border-t border-line pt-3 text-[13.5px] text-body">
          {EventIcon && <EventIcon className="size-[15px] shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{lastEvent.content.split(" · ")[0]}</span>
          <span className="text-[12.5px] text-muted">{formatTime(lastEvent.createdAt)}</span>
        </span>
      )}
      {t.isOpen && (
        <span className={`text-[13px] ${lastEvent ? "" : "border-t border-line pt-3"} ${t.sla.overdue ? "text-warning-ink" : "text-body"}`}>
          {t.sla.overdue
            ? `Prazo vencido · sem atualização do suporte ${formatAgo(t.lastSupportUpdateAt, now)}`
            : `Próxima resposta ${formatDeadline(t.sla.dueAt, now)} (${t.sla.label})`}
        </span>
      )}
    </div>
  );
}
