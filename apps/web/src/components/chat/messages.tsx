"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import type { Conversation, DraftTicket, Message, TicketSummary } from "@/server/conversations/types";
import { formatTime } from "@/server/format";
import { systemIcon } from "../timeline-icons";
import { PendingCard, TicketCard, TicketListCard } from "./cards";
import { DecisionPanel } from "./decision-panel";

export type MessageHandlers = {
  send: (text: string) => void;
  confirm: (pendingId: string) => void;
  cancel: (pendingId: string) => void;
  edit: (pendingId: string, edits: Partial<DraftTicket>) => Promise<boolean>;
};

export function ChatMessage({
  message,
  conversation,
  isLast,
  answer,
  busy,
  handlers,
}: {
  message: Message;
  conversation: Conversation;
  answer?: string;
  isLast: boolean;
  busy: boolean;
  handlers: MessageHandlers;
}) {
  switch (message.role) {
    case "employee":
      return (
        <div className="flex justify-end">
          <p className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[21px] whitespace-pre-wrap text-white">
            {message.content}
          </p>
        </div>
      );
    case "system": {
      const Icon = systemIcon(message.content);
      return (
        <div className="flex items-center gap-3 py-1 text-[12px] font-medium text-muted">
          <span className="h-px flex-1 bg-ink/10" />
          <span className="flex items-center gap-1.5">
            {Icon && <Icon className="size-3.5" />}
            {message.content} · {formatTime(message.createdAt)}
          </span>
          <span className="h-px flex-1 bg-ink/10" />
        </div>
      );
    }
    case "analyst":
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12.5px]">
            <span className="font-semibold">{message.authorName ?? "Analista"}</span>
            <span className="ml-2 rounded-md bg-success-tint px-1.5 py-px text-[11px] font-semibold text-success-ink">
              {message.meta.authorTitle ?? "Analista"}
            </span>
          </p>
          <p className="max-w-[600px] rounded-[4px_12px_12px_12px] bg-human-bubble px-4 py-3 text-[14.5px] leading-[22px] whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      );
    case "agent":
      return <AgentMessage message={message} conversation={conversation} isLast={isLast} answer={answer} busy={busy} handlers={handlers} />;
  }
}

function AgentMessage({
  message,
  conversation,
  isLast,
  answer,
  busy,
  handlers,
}: {
  message: Message;
  conversation: Conversation;
  isLast: boolean;
  answer?: string;
  busy: boolean;
  handlers: MessageHandlers;
}) {
  const [open, setOpen] = useState(false);
  const { steps = [], decision, cards = [], quickReplies = [] } = message.meta;
  const { body, question } = splitQuestion(message.content);
  const canAct = isLast && !busy && conversation.status === "agent";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => decision && setOpen((v) => !v)}
        className="group flex w-fit flex-wrap items-center gap-x-3 gap-y-1 text-left text-[12.5px]"
        aria-expanded={open}
        disabled={!decision}
      >
        <span className="font-semibold">Nexo Assist</span>
        {steps.map((s, i) => (
          <span key={i} className={`flex items-center gap-1 ${s.ok ? "text-muted" : "text-danger-ink"}`}>
            {s.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            {s.label}
          </span>
        ))}
        {decision && (
          <span className="flex items-center gap-0.5 text-link opacity-70 group-hover:opacity-100">
            por que respondi assim
            <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
          </span>
        )}
      </button>

      {open && decision && <DecisionPanel decision={decision} steps={steps} />}

      <div className="flex max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-line bg-white px-4 py-3">
        {body && <p className="text-[14.5px] leading-[22px] whitespace-pre-wrap">{body}</p>}
        {question && <p className="text-[14.5px] font-semibold">{question}</p>}
        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((q) => {
              const chosen = answer !== undefined && sameText(answer, q);
              return (
                <button
                  key={q}
                  disabled={!canAct}
                  onClick={() => handlers.send(q)}
                  className={`rounded-lg border px-3 py-[7px] text-[13.5px] font-medium ${
                    chosen
                      ? "border-info bg-primary-tint text-link"
                      : "border-line bg-white enabled:hover:border-primary/40 enabled:hover:bg-primary-tint enabled:hover:text-link disabled:text-muted"
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cards.map((card, i) => {
        switch (card.kind) {
          case "ticket_list":
            return (
              <TicketListCard
                key={i}
                tickets={card.tickets}
                disabled={!canAct}
                onPick={(t: TicketSummary) => handlers.send(`${t.number} · ${t.title}`)}
              />
            );
          case "ticket":
            return <TicketCard key={i} ticket={card.ticket} />;
          case "pending_action":
            return (
              <PendingCard
                key={`${i}-${card.action.id}`}
                action={conversation.pendingAction?.id === card.action.id ? conversation.pendingAction : card.action}
                active={conversation.pendingAction?.id === card.action.id && conversation.status === "agent"}
                busy={busy}
                onConfirm={() => handlers.confirm(card.action.id)}
                onCancel={() => handlers.cancel(card.action.id)}
                onEdit={(edits) => handlers.edit(card.action.id, edits)}
              />
            );
        }
      })}
    </div>
  );
}

const sameText = (a: string, b: string): boolean => a.trim().toLowerCase().startsWith(b.trim().toLowerCase());

export function splitQuestion(content: string): { body: string; question: string | null } {
  const text = content.trim();
  if (!text.endsWith("?")) return { body: text, question: null };
  const paragraphs = text.split(/\n\s*\n/);
  if (paragraphs.length > 1) {
    return { body: paragraphs.slice(0, -1).join("\n\n"), question: paragraphs.at(-1)!.trim() };
  }
  const match = text.match(/^([\s\S]*[.!])\s+([^.!?]+\?)$/);
  return match ? { body: match[1]!.trim(), question: match[2]!.trim() } : { body: text, question: null };
}
