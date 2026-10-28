import type { Conversation, Message } from "@/server/conversations/types";
import { TRANSFER_REASON_LABEL } from "@/server/conversations/types";
import { formatAgo } from "@/server/format";

/** Cores de avatar do protótipo, escolhidas de forma estável pelo nome. */
const AVATARS = [
  ["#DCE9F7", "#0062C4"],
  ["#F6E3D3", "#9A4A12"],
  ["#E6E1F7", "#5B3FC4"],
  ["#DDF0E6", "#1E7A4C"],
  ["#F7E1E6", "#A3324F"],
  ["#E5E8EC", "#3D4656"],
  ["#FBEFD0", "#8A6100"],
] as const;

export function avatarColors(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATARS[h % AVATARS.length]!;
  return { bg, fg };
}

export type Tag = { label: string; tone: "danger" | "warning" | "success" | "info" | "muted" };

/** Etiqueta da conversa na lista: por que ela precisa (ou não) de alguém. */
export function conversationTag(c: Conversation, me: string): Tag {
  switch (c.status) {
    case "aguardando_atendente": {
      const t = c.transfer;
      if (t?.reason === "baixa_confianca") {
        return { label: `Agent pediu ajuda · confiança ${Math.round((t.confidence ?? 0) * 100)}%`, tone: "warning" };
      }
      return { label: `Transferida · ${t?.ticketNumber ?? (t ? TRANSFER_REASON_LABEL[t.reason] : "")}`, tone: "danger" };
    }
    case "em_atendimento":
      return { label: c.assignedAnalyst === me ? "Em atendimento com você" : "Com outro analista", tone: "info" };
    case "agent":
      return { label: c.pendingAction ? "Agent atendendo · rascunho pendente" : "Agent atendendo", tone: "success" };
    case "encerrada":
      return { label: "Encerrada", tone: "muted" };
  }
}

export const TONE_CLASSES: Record<Tag["tone"], { dot: string; text: string }> = {
  danger: { dot: "bg-danger", text: "text-danger-ink" },
  warning: { dot: "bg-warning", text: "text-warning-ink" },
  success: { dot: "bg-success", text: "text-muted" },
  info: { dot: "bg-primary", text: "text-link" },
  muted: { dot: "bg-ink/30", text: "text-muted" },
};

export function previewOf(m: Pick<Message, "role" | "content"> | null, authorFirstName?: string): string {
  if (!m) return "Sem mensagens ainda";
  const prefix = m.role === "agent" ? "Nexo: " : m.role === "analyst" ? `${authorFirstName ?? "Analista"}: ` : m.role === "system" ? "" : "";
  return `${prefix}${m.content}`.replace(/\s+/g, " ");
}

export function waitingFor(c: Conversation, now: Date): string | null {
  if (c.status !== "aguardando_atendente" || !c.transfer) return null;
  // "há 7 min" — quanto tempo a pessoa espera um analista.
  return formatAgo(c.transfer.at, now).replace("agora há pouco", "agora");
}
