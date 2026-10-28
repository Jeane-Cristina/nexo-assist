import type { Session } from "../auth/session";
import type { Conversation, Message } from "../conversations/types";
import { TicketsError, type Actor } from "../tickets/client";
import type { Employee, Ticket } from "../tickets/schemas";
import { ChatError, type ChatDeps } from "./employee-chat";

/**
 * Casos de uso do console do analista (telas 4 e 5).
 *
 * Regras de quem pode o quê:
 * - qualquer analista vê todas as conversas e os chamados do funcionário;
 * - assumir pausa o agent; só quem assumiu escreve na conversa;
 * - conversa assumida por outro analista não pode ser assumida, devolvida nem encerrada.
 */

export const CONSOLE_FILTERS = ["para_voce", "com_agent", "minhas", "todas"] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];

export type ConversationListItem = {
  conversation: Conversation;
  lastMessage: Pick<Message, "role" | "content" | "createdAt"> | null;
};

export type ConsoleList = {
  items: ConversationListItem[];
  counts: Record<ConsoleFilter, number>;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: Message[];
  employee: Employee | null;
  /** null quando o legado está fora do ar: o console continua funcionando sem o painel. */
  tickets: Ticket[] | null;
};

type Analyst = { email: string; name: string };

const actorOf = (session: Session): Actor => ({ email: session.email, role: "analyst" });
const analystOf = (session: Session): Analyst => ({ email: session.email, name: session.name });

const matches = (filter: ConsoleFilter, c: Conversation, me: string): boolean => {
  switch (filter) {
    case "para_voce":
      return c.status === "aguardando_atendente";
    case "com_agent":
      return c.status === "agent";
    case "minhas":
      return c.status === "em_atendimento" && c.assignedAnalyst === me;
    case "todas":
      return true;
  }
};

export async function listConversations(
  deps: ChatDeps,
  session: Session,
  opts: { filter: ConsoleFilter; query?: string },
): Promise<ConsoleList> {
  const all = await deps.store.list();
  const counts = Object.fromEntries(CONSOLE_FILTERS.map((f) => [f, all.filter((c) => matches(f, c, session.email)).length])) as ConsoleList["counts"];

  const q = opts.query?.trim().toLowerCase();
  const filtered = all
    .filter((c) => matches(opts.filter, c, session.email))
    .filter(
      (c) =>
        !q ||
        c.employeeName.toLowerCase().includes(q) ||
        c.employeeEmail.includes(q) ||
        (c.focusTicket ?? "").toLowerCase().includes(q),
    )
    // Quem espera atendente vem primeiro, do que espera há mais tempo para o mais recente.
    .sort((a, b) => {
      const waitA = a.status === "aguardando_atendente" ? 0 : 1;
      const waitB = b.status === "aguardando_atendente" ? 0 : 1;
      if (waitA !== waitB) return waitA - waitB;
      if (waitA === 0) return (a.transfer?.at ?? a.updatedAt).localeCompare(b.transfer?.at ?? b.updatedAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const items = await Promise.all(
    filtered.map(async (conversation) => {
      const [last] = await deps.store.listMessages(conversation.id, { last: 1 });
      return { conversation, lastMessage: last ? { role: last.role, content: last.content, createdAt: last.createdAt } : null };
    }),
  );
  return { items, counts };
}

export async function getConversationDetail(deps: ChatDeps, session: Session, id: string): Promise<ConversationDetail> {
  const conversation = await deps.store.get(id);
  if (!conversation) throw new ChatError(404, "Conversa não encontrada.");
  const messages = await deps.store.listMessages(id);
  const actor = actorOf(session);
  const [employee, tickets] = await Promise.all([
    deps.tickets.getEmployee(actor, conversation.employeeEmail).catch(unavailableAsNull),
    deps.tickets.listTickets(actor, { scope: "all", requester: conversation.employeeEmail }).catch(unavailableAsNull),
  ]);
  return { conversation, messages, employee, tickets };
}

function unavailableAsNull(err: unknown): null {
  if (err instanceof TicketsError) return null;
  throw err;
}

async function load(deps: ChatDeps, id: string): Promise<Conversation> {
  const conversation = await deps.store.get(id);
  if (!conversation) throw new ChatError(404, "Conversa não encontrada.");
  if (conversation.status === "encerrada") throw new ChatError(409, "Esta conversa já foi encerrada.");
  return conversation;
}

function assertNotTakenByOther(conversation: Conversation, session: Session) {
  if (conversation.status === "em_atendimento" && conversation.assignedAnalyst !== session.email) {
    throw new ChatError(409, "Outro analista já está atendendo esta conversa.");
  }
}

/** Assumir: o agent pausa e o analista passa a responder. Vale também para conversas ainda com o agent. */
export async function takeOver(deps: ChatDeps, session: Session, id: string): Promise<Conversation> {
  const conversation = await load(deps, id);
  assertNotTakenByOther(conversation, session);
  if (conversation.status === "em_atendimento") return conversation;
  return deps.desk.takeOver(analystOf(session), conversation);
}

/** Devolver ao agent: o agent volta a responder a partir da próxima mensagem do funcionário. */
export async function returnToAgent(deps: ChatDeps, session: Session, id: string): Promise<Conversation> {
  const conversation = await load(deps, id);
  assertNotTakenByOther(conversation, session);
  if (conversation.status === "agent") throw new ChatError(409, "A conversa já está com o agent.");
  return deps.desk.returnToAgent(analystOf(session), conversation);
}

export async function closeConversation(deps: ChatDeps, session: Session, id: string): Promise<Conversation> {
  const conversation = await load(deps, id);
  assertNotTakenByOther(conversation, session);
  return deps.desk.close(analystOf(session), conversation);
}

/** Mensagem do analista para o funcionário. Só depois de assumir, e só quem assumiu. */
export async function sendAnalystMessage(deps: ChatDeps, session: Session, id: string, text: string): Promise<Message> {
  const conversation = await load(deps, id);
  if (conversation.status !== "em_atendimento") throw new ChatError(409, "Assuma o atendimento para responder.");
  assertNotTakenByOther(conversation, session);
  return deps.store.appendMessage(id, {
    role: "analyst",
    authorName: session.name,
    content: text,
    meta: session.department ? { authorTitle: session.department } : {},
  });
}
