"use client";

import { Bot, CheckCheck, ChevronDown, CircleCheckBig, Hand, Headset, MessageSquareText, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConversationDetail } from "@/server/chat/analyst-console";
import type { Card, Conversation, Message } from "@/server/conversations/types";
import { formatAgo, formatTime } from "@/server/format";
import { DecisionPanel } from "../chat/decision-panel";
import { initials } from "../ui";
import { systemIcon } from "../timeline-icons";
import { avatarColors } from "./helpers";

export type ViewActions = {
  takeOver: () => void;
  returnToAgent: () => void;
  close: () => void;
  send: (text: string) => Promise<boolean>;
};

export function ConversationView({ detail, me, busy, actions }: { detail: ConversationDetail; me: string; busy: boolean; actions: ViewActions }) {
  const { conversation: c, messages, employee } = detail;
  const colors = avatarColors(c.employeeName);
  const mine = c.status === "em_atendimento" && c.assignedAnalyst === me;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, c.id]);

  const meta = [employee?.department, c.focusTicket].filter(Boolean).join(" · ");

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white pr-4 pl-5">
        <span className="grid size-10 place-items-center rounded-full text-[14.5px] font-semibold" style={{ background: colors.bg, color: colors.fg }}>
          {initials(c.employeeName)}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15.5px] font-semibold">{c.employeeName}</span>
          <span className="truncate text-[12.5px] text-muted">{meta || c.employeeEmail}</span>
        </span>
        <span className="flex-1" />
        {mine ? (
          <>
            <button onClick={actions.returnToAgent} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium text-body hover:bg-surface">
              <Bot className="size-4" />
              Devolver ao agent
            </button>
            <button
              onClick={actions.close}
              disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-danger-tint px-3 text-[13.5px] font-semibold text-danger-ink hover:bg-danger/15"
            >
              <CircleCheckBig className="size-4" />
              Encerrar atendimento
            </button>
          </>
        ) : (
          <ModePill conversation={c} />
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-10 pt-5 pb-4">
        <div className="mx-auto flex max-w-[760px] flex-col">
          {messages.map((m, i) => (
            <ConsoleMessage key={m.id} message={m} previous={messages[i - 1]} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <Footer conversation={c} mine={mine} busy={busy} actions={actions} />
    </section>
  );
}

function ModePill({ conversation: c }: { conversation: Conversation }) {
  const map = {
    aguardando_atendente: ["Aguardando atendente", "bg-warning-tint text-warning-ink"],
    em_atendimento: ["Com outro analista", "bg-primary-tint text-link"],
    agent: ["Agent atendendo", "bg-success-tint text-success-ink"],
    encerrada: ["Encerrada", "bg-surface text-muted"],
  } as const;
  const [label, cls] = map[c.status];
  return (
    <span className={`flex items-center gap-[7px] rounded-full px-[11px] py-1.5 text-[12.5px] font-semibold ${cls}`}>
      {c.status !== "encerrada" && <Bot className="size-3.5" />}
      {label}
    </span>
  );
}

function ConsoleMessage({ message: m, previous }: { message: Message; previous?: Message }) {
  const [open, setOpen] = useState(false);
  const grouped = previous?.role === m.role && m.role === "employee";
  const fromSupport = m.role === "agent" || m.role === "analyst";
  const time = (
    <span className="flex items-center gap-[3px] self-end pb-px text-[11px] whitespace-nowrap text-muted">
      {formatTime(m.createdAt)}
      {fromSupport && <CheckCheck className="size-3.5 text-info" aria-label="entregue" />}
    </span>
  );

  if (m.role === "system") {
    const Icon = systemIcon(m.content);
    return (
      <div className="flex items-center gap-3 pt-[18px] pb-1 text-[12px] font-medium text-muted">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5" />}
          {m.content} · {formatTime(m.createdAt)}
        </span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>
    );
  }

  if (m.role === "employee") {
    return (
      <div className={`flex ${grouped ? "pt-[3px]" : "pt-4"}`}>
        <div className={`flex max-w-[520px] gap-2.5 bg-white px-3 pt-2 pb-1.5 ${grouped ? "rounded-xl" : "rounded-[4px_12px_12px_12px]"}`}>
          <p className="text-[14.5px] leading-[21px] whitespace-pre-wrap">{m.content}</p>
          {time}
        </div>
      </div>
    );
  }

  const isAgent = m.role === "agent";
  const { decision, steps = [], cards = [] } = m.meta;
  return (
    <div className="flex flex-col items-end gap-1 pt-4">
      <span className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-body">
        {m.authorName ?? (isAgent ? "Nexo Assist" : "Analista")}
        <span className={`rounded-md px-1.5 py-px text-[11px] ${isAgent ? "bg-primary-tint text-link" : "bg-success-tint text-success-ink"}`}>
          {isAgent ? "IA" : (m.meta.authorTitle ?? "Analista")}
        </span>
      </span>
      <div className={`flex max-w-[520px] flex-col gap-1 rounded-[12px_4px_12px_12px] px-3 pt-2 pb-1.5 ${isAgent ? "bg-agent-bubble" : "bg-human-bubble"}`}>
        <span className="flex gap-2.5">
          <p className="text-[14.5px] leading-[21px] whitespace-pre-wrap">{m.content}</p>
          {time}
        </span>
        {cards.length > 0 && <CardChips cards={cards} />}
      </div>
      {isAgent && decision && (
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1 px-1 text-[11.5px] hover:text-link ${decision.intent === "indefinida" ? "text-warning-ink" : "text-muted"}`}
        >
          {decisionSummary(decision, steps)}
          <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && decision && <DecisionPanel decision={decision} steps={steps} />}
    </div>
  );
}

function CardChips({ cards }: { cards: Card[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {cards.map((card, i) => {
        const text =
          card.kind === "ticket"
            ? `Chamado ${card.ticket.number} · ${card.ticket.statusLabel}`
            : card.kind === "ticket_list"
              ? `Lista com ${card.tickets.length} chamados`
              : card.action.kind === "create"
                ? `Rascunho ${card.action.id} · ${card.action.draft.title}`
                : `Rascunho ${card.action.id} · ${card.action.mode} do ${card.action.ticketNumber}`;
        return (
          <span key={i} className="flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[11.5px] text-body">
            <MessageSquareText className="size-3" />
            {text}
          </span>
        );
      })}
    </span>
  );
}

function Footer({ conversation: c, mine, busy, actions }: { conversation: Conversation; mine: boolean; busy: boolean; actions: ViewActions }) {
  const [text, setText] = useState("");
  const now = new Date();

  if (mine) {
    const submit = async () => {
      if (!text.trim() || busy) return;
      if (await actions.send(text.trim())) setText("");
    };
    return (
      <div className="border-t border-line bg-white px-5 pt-2.5 pb-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex items-end gap-3"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={`Responder para ${c.employeeName.split(" ")[0]}…`}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-xl bg-surface px-3.5 py-2.5 text-[14.5px] outline-none focus:ring-3 focus:ring-primary/15"
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar" className="grid size-11 place-items-center rounded-full bg-primary text-white disabled:opacity-50">
            <SendHorizontal className="size-[18px]" />
          </button>
        </form>
      </div>
    );
  }

  if (c.status === "encerrada") {
    return <p className="border-t border-line bg-white px-5 py-4 text-[13.5px] text-muted">Conversa encerrada. Se a pessoa voltar, uma nova conversa começa com o agent.</p>;
  }
  if (c.status === "em_atendimento") {
    return <p className="border-t border-line bg-white px-5 py-4 text-[13.5px] text-muted">Outro analista está atendendo esta conversa.</p>;
  }

  const waiting = c.status === "aguardando_atendente";
  const first = c.employeeName.split(" ")[0];
  return (
    <div className="flex flex-col gap-2.5 border-t border-line bg-white px-5 pt-3 pb-3.5">
      <div className="flex items-center gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${waiting ? "bg-warning-tint text-warning-ink" : "bg-success-tint text-success-ink"}`}>
          {waiting ? <Hand className="size-4" /> : <Bot className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14.5px] font-semibold">{waiting ? `${first} espera você` : `Agent atendendo ${first}`}</span>
          <span className="truncate text-[12.5px] text-muted">
            {waiting && c.transfer
              ? `Agent pausado · transferida ${formatAgo(c.transfer.at, now)}`
              : "Assumir pausa o agent e você passa a responder"}
          </span>
        </span>
        {waiting && (
          <button onClick={actions.returnToAgent} disabled={busy} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium text-body hover:bg-surface">
            <Bot className="size-4" />
            Devolver ao agent
          </button>
        )}
        <button
          onClick={actions.takeOver}
          disabled={busy}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13.5px] font-semibold text-white hover:bg-[#0056ad] disabled:opacity-60"
        >
          <Headset className="size-4" />
          Assumir atendimento
        </button>
      </div>
      <div className="flex h-11 items-center rounded-xl bg-surface px-3.5 text-[14.5px] text-muted">Assuma o atendimento para responder</div>
    </div>
  );
}

function decisionSummary(decision: NonNullable<Message["meta"]["decision"]>, steps: NonNullable<Message["meta"]["steps"]>): string {
  if (decision.intent === "indefinida" && steps.length === 0) return "não conseguiu responder · ver detalhes";
  const conf = decision.confidence === null ? "confiança não informada" : `confiança ${Math.round(decision.confidence * 100)}%`;
  const what = steps.length ? steps.map((s) => s.label).join(" · ") : decision.action;
  return `${what} · ${conf}`;
}
