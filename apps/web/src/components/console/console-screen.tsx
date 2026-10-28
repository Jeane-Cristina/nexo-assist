"use client";

import { LogOut, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ConsoleFilter, ConsoleList, ConversationDetail } from "@/server/chat/analyst-console";
import { NexoMark } from "../nexo-mark";
import { initials } from "../ui";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { TicketPanel } from "./ticket-panel";

/**
 * Console do analista (telas 4 e 5). As respostas dos funcionários chegam por
 * polling: lista a cada 4s, conversa aberta a cada 3s.
 */

const LIST_POLL_MS = 4000;
const DETAIL_POLL_MS = 3000;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
  return data;
}

export function ConsoleScreen({ me, initialList }: { me: { email: string; name: string }; initialList: ConsoleList }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ConsoleFilter>("para_voce");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<ConsoleList>(initialList);
  const [selectedId, setSelectedId] = useState<string | null>(initialList.items[0]?.conversation.id ?? null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const qs = new URLSearchParams({ filter, ...(query ? { q: query } : {}) });
    setList(await api<ConsoleList>(`/api/console/conversations?${qs}`));
  }, [filter, query]);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return setDetail(null);
    const d = await api<ConversationDetail>(`/api/console/conversations/${selectedId}`);
    setDetail((prev) => (prev?.conversation.id === selectedId || !prev ? d : prev));
  }, [selectedId]);

  useEffect(() => {
    void refreshList().catch(() => undefined);
    const t = setInterval(() => void refreshList().catch(() => undefined), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [refreshList]);

  useEffect(() => {
    setDetail(null);
    void refreshDetail().catch((e: Error) => setError(e.message));
    const t = setInterval(() => void refreshDetail().catch(() => undefined), DETAIL_POLL_MS);
    return () => clearInterval(t);
  }, [refreshDetail]);

  const act = (path: string) => async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/console/conversations/${selectedId}/${path}`, {});
      await Promise.all([refreshDetail(), refreshList()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (text: string): Promise<boolean> => {
    if (!selectedId) return false;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/console/conversations/${selectedId}/messages`, { text });
      await refreshDetail();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Trilho */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1.5 bg-surface py-4">
        <span className="grid size-10 place-items-center pb-2">
          <NexoMark size={22} color="#1B2431" />
        </span>
        <span className="relative grid size-10 place-items-center rounded-xl bg-white text-ink shadow-sm" title="Conversas">
          <MessageCircle className="size-5" />
          {list.counts.para_voce > 0 && (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {list.counts.para_voce}
            </span>
          )}
        </span>
        <span className="flex-1" />
        <button onClick={logout} className="grid size-9 place-items-center rounded-lg text-body hover:bg-white" title="Sair">
          <LogOut className="size-4" />
        </button>
        <span className="relative grid size-9 place-items-center rounded-full bg-primary-tint text-[12.5px] font-bold text-link" title={me.name}>
          {initials(me.name)}
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-surface bg-success" />
        </span>
      </nav>

      <ConversationList
        list={list}
        filter={filter}
        query={query}
        selectedId={selectedId}
        me={me.email}
        onFilter={setFilter}
        onQuery={setQuery}
        onSelect={setSelectedId}
      />

      {detail ? (
        <>
          <div className="relative flex min-w-0 flex-1">
            <ConversationView
              detail={detail}
              me={me.email}
              busy={busy}
              actions={{ takeOver: act("takeover"), returnToAgent: act("return"), close: act("close"), send }}
            />
            {error && (
              <p role="alert" className="absolute top-20 left-1/2 -translate-x-1/2 rounded-lg bg-danger-tint px-3 py-2 text-[13px] text-danger-ink shadow-sm">
                {error}
              </p>
            )}
          </div>
          <TicketPanel detail={detail} />
        </>
      ) : (
        <div className="grid flex-1 place-items-center bg-canvas text-[14px] text-muted">
          {selectedId ? "Carregando conversa…" : "Selecione uma conversa à esquerda."}
        </div>
      )}
    </div>
  );
}
