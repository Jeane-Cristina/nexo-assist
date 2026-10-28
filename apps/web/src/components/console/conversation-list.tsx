"use client";

import { CheckCheck, Search } from "lucide-react";
import type { ConsoleFilter, ConsoleList } from "@/server/chat/analyst-console";
import { formatTime } from "@/server/format";
import { Dot, initials } from "../ui";
import { avatarColors, conversationTag, previewOf, TONE_CLASSES, waitingFor } from "./helpers";

const FILTER_LABEL: Record<ConsoleFilter, string> = {
  todas: "Todas",
  para_voce: "Para você",
  com_agent: "Com o agent",
  minhas: "Minhas",
};
const FILTER_ORDER: ConsoleFilter[] = ["todas", "para_voce", "com_agent", "minhas"];

/** Coluna da esquerda da tela 4: conversas com filtros, busca e etiqueta de situação. */
export function ConversationList({
  list,
  filter,
  query,
  selectedId,
  me,
  onFilter,
  onQuery,
  onSelect,
}: {
  list: ConsoleList;
  filter: ConsoleFilter;
  query: string;
  selectedId: string | null;
  me: string;
  onFilter: (f: ConsoleFilter) => void;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
}) {
  const now = new Date();
  return (
    <section className="flex w-[380px] shrink-0 flex-col border-r border-line">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Conversas</h1>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-[5px] text-[12.5px] font-semibold text-success-ink">
            <Dot className="bg-success" size={7} />
            Disponível
          </span>
        </div>
        <label className="flex h-9 items-center gap-2.5 rounded-full bg-surface px-3">
          <Search className="size-4 text-muted" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {FILTER_ORDER.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                onClick={() => onFilter(f)}
                className={`flex items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[12.5px] font-medium whitespace-nowrap ${
                  active ? "bg-primary-tint text-link" : "bg-surface text-body hover:bg-line"
                }`}
              >
                {FILTER_LABEL[f]}
                {f !== "todas" && <span className={`font-semibold ${active ? "text-link" : "text-muted"}`}>{list.counts[f]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {list.items.length === 0 && <p className="px-3 py-8 text-center text-[13.5px] text-muted">Nenhuma conversa neste filtro.</p>}
        {list.items.map(({ conversation: c, lastMessage }) => {
          const tag = conversationTag(c, me);
          const tone = TONE_CLASSES[tag.tone];
          const colors = avatarColors(c.employeeName);
          const selected = c.id === selectedId;
          const waiting = waitingFor(c, now);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full gap-3 rounded-xl p-2.5 text-left ${selected ? "bg-surface" : "hover:bg-surface/60"}`}
            >
              <span
                className="grid size-[46px] shrink-0 place-items-center rounded-full text-[15.5px] font-semibold"
                style={{ background: colors.bg, color: colors.fg }}
              >
                {initials(c.employeeName)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px] border-b border-line pb-2.5">
                <span className="flex items-center gap-2">
                  <span className={`truncate text-[15.5px] ${c.status === "aguardando_atendente" ? "font-semibold" : "font-medium"}`}>
                    {c.employeeName}
                  </span>
                  <span className={`ml-auto shrink-0 text-[12.5px] ${c.status === "aguardando_atendente" ? "font-semibold text-primary" : "text-muted"}`}>
                    {lastMessage ? formatTime(lastMessage.createdAt) : ""}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-[13.5px] text-muted">
                  {(lastMessage?.role === "agent" || lastMessage?.role === "analyst") && <CheckCheck className="size-3.5 shrink-0 text-info" />}
                  <span className="truncate">{previewOf(lastMessage)}</span>
                </span>
                <span className={`flex items-center gap-[5px] text-[11.5px] font-medium ${tone.text}`}>
                  <Dot className={tone.dot} />
                  <span className="truncate">{tag.label}</span>
                  {waiting && <span className="shrink-0 font-normal text-muted">· {waiting}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
