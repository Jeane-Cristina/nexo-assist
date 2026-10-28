"use client";

import { Bot } from "lucide-react";
import type { ConversationDetail } from "@/server/chat/analyst-console";
import { TRANSFER_REASON_LABEL } from "@/server/conversations/types";
import { formatAgo, formatDay, formatDeadline } from "@/server/format";
import { PRIORITY_LABEL, STATUS_LABEL, type Ticket } from "@/server/tickets/schemas";
import { Dot, STATUS_DOT } from "../ui";

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
            <CurrentTicket ticket={current} />
          ) : (
            <p className="text-[13px] text-muted">{c.focusTicket ? `${c.focusTicket} (indisponível agora)` : "Nenhum chamado em foco nesta conversa."}</p>
          )}
        </section>

        {others.length > 0 && (
          <section className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-muted">Outros chamados</span>
            {others.map((t) => (
              <div key={t.number} className="flex gap-3 border-b border-line py-3 last:border-0">
                <Dot className={`mt-1.5 ${STATUS_DOT[t.status]}`} size={7} />
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate text-[14.5px] font-medium">{t.title}</span>
                  <span className="text-[12.5px] text-muted">
                    {t.number} · {t.isOpen ? STATUS_LABEL[t.status] : `${STATUS_LABEL[t.status]} em ${formatDay(t.resolvedAt ?? t.updatedAt)}`}
                    {t.sla.overdue && <span className="text-warning-ink"> · vencido</span>}
                  </span>
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

function CurrentTicket({ ticket: t }: { ticket: Ticket }) {
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
      {t.isOpen && (
        <span className={`border-t border-line pt-3 text-[13px] ${t.sla.overdue ? "text-warning-ink" : "text-body"}`}>
          {t.sla.overdue
            ? `Prazo vencido · sem atualização do suporte ${formatAgo(t.lastSupportUpdateAt, now)}`
            : `Próxima resposta ${formatDeadline(t.sla.dueAt, now)} (${t.sla.label})`}
        </span>
      )}
    </div>
  );
}
