"use client";

import { ArrowUp, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSnapshot } from "@/server/chat/employee-chat";
import { MAX_EMPLOYEE_MESSAGES, type Conversation, type DraftTicket, type Message } from "@/server/conversations/types";
import { TopBar } from "../top-bar";
import { ChatMessage } from "./messages";

/**
 * Tela de atendimento do funcionário (telas 2 e 3 do protótipo).
 * O estado vem do servidor; a tela só envia ações e mostra o resultado.
 */

const POLL_MS = 3000;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Algo deu errado. Tente de novo.");
  return data;
}

export function ChatScreen({ initial }: { initial: ChatSnapshot }) {
  const [conversation, setConversation] = useState<Conversation>(initial.conversation);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const paused = conversation.status === "aguardando_atendente" || conversation.status === "em_atendimento";
  const closed = conversation.status === "encerrada";
  const limitReached = conversation.employeeMessageCount >= MAX_EMPLOYEE_MESSAGES;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingText, busy]);

  // Com um analista na conversa, as respostas chegam de fora: consulta o servidor a cada 3s.
  useEffect(() => {
    if (!paused) return;
    const timer = setInterval(async () => {
      try {
        const snap = await api<ChatSnapshot>(`/api/chat?conversationId=${conversation.id}`);
        setConversation(snap.conversation);
        setMessages(snap.messages);
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [paused, conversation.id]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setBusy(false);
      setPendingText(null);
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      setDraft("");
      setPendingText(clean);
      void run(async () => {
        const res = await api<{ conversation: Conversation; messages: Message[] }>("/api/chat/messages", {
          conversationId: conversation.id,
          text: clean,
        });
        setConversation(res.conversation);
        setMessages((prev) => [...prev, ...res.messages]);
      });
    },
    [busy, conversation.id, run],
  );

  const pending = useCallback(
    (action: "confirm" | "cancel", pendingId: string) =>
      void run(async () => {
        const res = await api<{ conversation: Conversation; messages: Message[] }>("/api/chat/pending", {
          conversationId: conversation.id,
          pendingId,
          action,
        });
        setConversation(res.conversation);
        setMessages((prev) => [...prev, ...res.messages]);
      }),
    [conversation.id, run],
  );

  const edit = useCallback(
    async (pendingId: string, edits: Partial<DraftTicket>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await api<{ conversation: Conversation }>("/api/chat/pending", { conversationId: conversation.id, pendingId, action: "edit", edits });
        setConversation(res.conversation);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível salvar.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [conversation.id],
  );

  const newConversation = () =>
    void run(async () => {
      const snap = await api<ChatSnapshot>("/api/chat/new", { conversationId: conversation.id });
      setConversation(snap.conversation);
      setMessages(snap.messages);
    });

  const handlers = { send, confirm: (id: string) => pending("confirm", id), cancel: (id: string) => pending("cancel", id), edit };

  return (
    <>
      <TopBar here="Atendimento">
        <StatusPill conversation={conversation} />
        {!paused && !closed && messages.length > 0 && (
          <button
            onClick={newConversation}
            disabled={busy}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-body hover:bg-surface disabled:opacity-60"
          >
            <Plus className="size-3.5" />
            Nova conversa
          </button>
        )}
      </TopBar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[856px] flex-col gap-5 px-6 pt-7 pb-2">
          {messages.length === 0 && !pendingText && <Welcome name={initial.employee.name} onPick={send} />}
          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              conversation={conversation}
              isLast={i === messages.length - 1}
              answer={messages[i + 1]?.role === "employee" ? messages[i + 1]?.content : (pendingText ?? undefined)}
              busy={busy}
              handlers={handlers}
            />
          ))}
          {pendingText && (
            <>
              <div className="flex justify-end">
                <p className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[21px] whitespace-pre-wrap text-white/80">
                  {pendingText}
                </p>
              </div>
              {!paused && <Thinking />}
            </>
          )}
          {paused && !pendingText && <PausedNotice conversation={conversation} />}
          {closed && (
            <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 text-[13.5px] text-body">
              Este atendimento foi encerrado.
              <button onClick={newConversation} disabled={busy} className="ml-auto rounded-lg bg-primary px-3 py-1.5 font-semibold text-white">
                Começar nova conversa
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[856px] px-6 pt-2.5 pb-[18px]">
        {error && (
          <p role="alert" className="mb-2 rounded-lg bg-danger-tint px-3 py-2 text-[13px] text-danger-ink">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex min-h-12 items-end gap-2 rounded-xl border border-line bg-white py-1.5 pr-1.5 pl-4 focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/10"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            maxLength={2000}
            disabled={limitReached || closed}
            placeholder={closed ? "Atendimento encerrado" : limitReached ? "Limite de mensagens atingido" : paused ? "Escreva para o analista…" : "Escreva para o Nexo…"}
            className="max-h-40 flex-1 resize-none self-center bg-transparent py-1.5 text-[14.5px] outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim() || limitReached || closed}
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            <ArrowUp className="size-4" />
            Enviar
          </button>
        </form>
        <p className="mt-1.5 text-right text-[12.5px] text-muted">
          {conversation.employeeMessageCount}/{MAX_EMPLOYEE_MESSAGES} mensagens nesta sessão
        </p>
      </div>
    </>
  );
}

function StatusPill({ conversation }: { conversation: Conversation }) {
  const map = {
    agent: { label: "Assistente online", cls: "bg-success-tint text-success-ink", dot: "bg-success" },
    aguardando_atendente: { label: "Aguardando analista", cls: "bg-warning-tint text-warning-ink", dot: "bg-warning" },
    em_atendimento: { label: "Com um analista", cls: "bg-primary-tint text-link", dot: "bg-primary" },
    encerrada: { label: "Conversa encerrada", cls: "bg-surface text-muted", dot: "bg-ink/30" },
  } as const;
  const s = map[conversation.status];
  return (
    <span className={`flex items-center gap-[7px] rounded-full px-2.5 py-[5px] text-[12.5px] font-semibold ${s.cls}`}>
      <span className={`size-[7px] rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Thinking() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">
        Nexo Assist <span className="font-normal text-muted">está analisando…</span>
      </span>
      <span className="flex w-fit gap-1 rounded-[4px_12px_12px_12px] border border-line bg-white px-4 py-3.5">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </div>
  );
}

function PausedNotice({ conversation }: { conversation: Conversation }) {
  const text =
    conversation.status === "em_atendimento"
      ? "Um analista está atendendo você. O assistente está pausado."
      : "Um analista vai continuar esta conversa aqui. Enquanto isso, o assistente fica pausado. Você pode escrever para ele.";
  return <p className="rounded-lg bg-warning-tint px-3.5 py-2.5 text-[13px] text-warning-ink">{text}</p>;
}

const SUGGESTIONS = ["Meu notebook não conecta na VPN", "Qual o status do meu chamado?", "Preciso de acesso a uma pasta", "Qual o Wi-Fi para visitantes?"];

function Welcome({ name, onPick }: { name: string; onPick: (t: string) => void }) {
  return (
    <div className="flex flex-col gap-4 py-10">
      <h1 className="font-serif text-[34px] leading-10">Olá, {name.split(" ")[0]}. Como posso ajudar?</h1>
      <p className="max-w-[560px] text-[14.5px] leading-[22px] text-muted">
        Descreva o problema com suas palavras. Eu consulto seus chamados e a central de ajuda, abro ou atualizo chamados com a sua
        confirmação, e chamo um analista quando precisar.
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="rounded-lg border border-line px-3 py-2 text-[13.5px] font-medium hover:bg-surface">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
