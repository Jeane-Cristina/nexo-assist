import { randomInt } from "node:crypto";
import { classifyPriority, type TriageInput } from "./agent/triage";
import type { ConversationStore } from "./conversations/store";
import type { Card, Conversation, DraftTicket, PendingAction, TicketSummary, TransferReason } from "./conversations/types";
import { formatDeadline } from "./format";
import { TicketsError, type Actor, type TicketsClient } from "./tickets/client";
import { PRIORITY_LABEL, STATUS_LABEL, type Ticket } from "./tickets/schemas";

/**
 * Operações determinísticas do atendimento. São chamadas tanto pelas
 * ferramentas do agent quanto pelos botões da interface (Confirmar, Cancelar,
 * Assumir...). Regra crítica mora aqui, não no prompt: o modelo pode errar,
 * estas funções não deixam o erro virar efeito.
 */

export type ConfirmOutcome = {
  ticket: Ticket;
  kind: "criado" | "atualizado" | "reaberto";
  /** Frase pronta para o funcionário, com número e prazo. */
  summary: string;
  /** Preenchido quando a confirmação disparou transferência automática (ex.: chamado crítico). */
  autoTransfer: TransferOutcome | null;
};

export type TransferOutcome = {
  conversation: Conversation;
  /** Expectativa de contato, para o agent repassar ao funcionário. */
  contactEstimate: string;
  ticketUpdated: boolean;
};

export const toTicketSummary = (t: Ticket): TicketSummary => ({
  number: t.number,
  title: t.title,
  status: t.status,
  statusLabel: STATUS_LABEL[t.status],
  priority: t.priority,
  category: t.category,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  lastSupportUpdateAt: t.lastSupportUpdateAt,
  description: t.description,
  sla: t.sla,
});

export class ServiceDesk {
  constructor(
    private readonly tickets: TicketsClient,
    private readonly store: ConversationStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  reload(conversation: Conversation): Promise<Conversation> {
    return this.store.require(conversation.id);
  }

  /** Chamado "em foco" na conversa: aparece no console do analista e recebe o resumo na transferência. */
  setFocusTicket(conversation: Conversation, number: string): Promise<Conversation> {
    return this.store.update(conversation.id, { focusTicket: number });
  }

  // -------------------------------------------------------------------------
  // Rascunho → confirmação

  /** Monta o rascunho com prioridade calculada e prazo vindo do serviço. Não cria nada. */
  async draftTicket(
    actor: Actor,
    conversation: Conversation,
    input: Omit<DraftTicket, "priority" | "priorityRule" | "sla">,
  ): Promise<{ conversation: Conversation; action: Extract<PendingAction, { kind: "create" }> }> {
    const triage = classifyPriority(input);
    const sla = await this.tickets.previewSla(actor, triage.priority);
    const action: PendingAction = {
      id: newDraftId(),
      kind: "create",
      proposedAt: this.clock().toISOString(),
      draft: { ...input, priority: triage.priority, priorityRule: triage.rule, sla },
    };
    const updated = await this.store.update(conversation.id, { pendingAction: action });
    return { conversation: updated, action };
  }

  /** Edição feita pelo funcionário no cartão do rascunho: recalcula prioridade e prazo. */
  async editDraft(
    actor: Actor,
    conversation: Conversation,
    edits: Partial<Pick<DraftTicket, "title" | "description" | "category" | "impact" | "blocking" | "deadlineToday" | "type">>,
  ): Promise<Conversation> {
    const pending = conversation.pendingAction;
    if (!pending || pending.kind !== "create") throw new Error("Não há rascunho de chamado para editar.");
    const merged = { ...pending.draft, ...edits };
    const triage = classifyPriority(merged as TriageInput);
    const sla = triage.priority === pending.draft.priority ? pending.draft.sla : await this.tickets.previewSla(actor, triage.priority);
    return this.store.update(conversation.id, {
      pendingAction: { ...pending, draft: { ...merged, priority: triage.priority, priorityRule: triage.rule, sla } },
    });
  }

  async proposeUpdate(
    conversation: Conversation,
    action: Omit<Extract<PendingAction, { kind: "update" }>, "id" | "kind" | "proposedAt">,
  ): Promise<{ conversation: Conversation; action: Extract<PendingAction, { kind: "update" }> }> {
    const full: Extract<PendingAction, { kind: "update" }> = {
      id: newDraftId(),
      kind: "update",
      proposedAt: this.clock().toISOString(),
      ...action,
    };
    const updated = await this.store.update(conversation.id, { pendingAction: full });
    return { conversation: updated, action: full };
  }

  async cancelPending(conversation: Conversation): Promise<Conversation> {
    return this.store.update(conversation.id, { pendingAction: null });
  }

  /**
   * Executa a ação pendente. `expectedId` garante que se confirma exatamente o
   * rascunho que o funcionário viu — nem uma versão anterior, nem outra.
   */
  async confirmPending(actor: Actor, conversation: Conversation, expectedId: string): Promise<ConfirmOutcome> {
    const pending = conversation.pendingAction;
    if (!pending || pending.id !== expectedId) {
      throw new Error(`O rascunho ${expectedId} não está mais pendente.`);
    }
    const now = this.clock();
    let ticket: Ticket;
    let kind: ConfirmOutcome["kind"];

    if (pending.kind === "create") {
      const { draft } = pending;
      const created = await this.tickets.createTicket(
        actor,
        { type: draft.type, title: draft.title, description: draft.description, category: draft.category, priority: draft.priority, impact: draft.impact },
        // A chave do rascunho torna o retry seguro: nunca dois chamados para o mesmo rascunho.
        `${conversation.id}:${pending.id}`,
      );
      ticket = created.ticket;
      kind = "criado";
    } else {
      if (pending.mode === "reabertura") {
        ticket = await this.tickets.reopen(actor, pending.ticketNumber, pending.message);
        kind = "reaberto";
      } else {
        ticket = await this.tickets.addUpdate(actor, pending.ticketNumber, pending.message);
        kind = "atualizado";
      }
      if (pending.reclassify && pending.reclassify.priority !== ticket.priority) {
        ticket = await this.tickets.reclassify(actor, ticket.number, { priority: pending.reclassify.priority }, pending.reclassify.rule);
      }
    }

    let updated = await this.store.update(conversation.id, { pendingAction: null, focusTicket: ticket.number });
    const verb = { criado: "Abri", atualizado: "Atualizei", reaberto: "Reabri" }[kind];
    const summary =
      `${verb} o chamado ${ticket.number} com prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}. ` +
      `Um analista responde até ${formatDeadline(ticket.sla.dueAt, now)} (prazo de ${ticket.sla.label}).`;

    // Regra do Anexo A: caso crítico vai direto para um analista.
    let autoTransfer: TransferOutcome | null = null;
    if (ticket.priority === "critica" && updated.status === "agent") {
      autoTransfer = await this.transfer(actor, updated, {
        reason: "chamado_critico",
        summary: `Chamado crítico ${ticket.number}: ${ticket.title}. ${ticket.description}`,
        confidence: null,
      });
      updated = autoTransfer.conversation;
    }
    return { ticket, kind, summary, autoTransfer };
  }

  // -------------------------------------------------------------------------
  // Transferência e console do analista

  /**
   * Marca a conversa como aguardando atendente (o agent para de responder) e,
   * se houver chamado em foco, registra o resumo nele. Se o legado estiver
   * fora do ar, a conversa é transferida mesmo assim: o funcionário não pode
   * ficar preso por causa do sistema de chamados.
   */
  async transfer(
    actor: Actor,
    conversation: Conversation,
    opts: { reason: TransferReason; summary: string; confidence: number | null },
  ): Promise<TransferOutcome> {
    const now = this.clock();
    let ticketUpdated = false;
    let contactEstimate = "no horário do service desk (segunda a sexta, das 8h às 18h)";

    if (conversation.focusTicket) {
      try {
        const ticket = await this.tickets.transfer(actor, conversation.focusTicket, opts.summary);
        ticketUpdated = true;
        if (!ticket.sla.overdue) contactEstimate = `até ${formatDeadline(ticket.sla.dueAt, now)}`;
        else contactEstimate = "com prioridade, porque o prazo do chamado já venceu";
      } catch (err) {
        if (!(err instanceof TicketsError)) throw err;
      }
    }

    const updated = await this.store.update(conversation.id, {
      status: "aguardando_atendente",
      pendingAction: null,
      transfer: {
        reason: opts.reason,
        summary: opts.summary,
        at: now.toISOString(),
        ticketNumber: conversation.focusTicket,
        confidence: opts.confidence,
      },
    });
    return { conversation: updated, contactEstimate, ticketUpdated };
  }

  async takeOver(analyst: { email: string; name: string }, conversation: Conversation): Promise<Conversation> {
    if (conversation.status === "encerrada") throw new Error("A conversa já foi encerrada.");
    const updated = await this.store.update(conversation.id, { status: "em_atendimento", assignedAnalyst: analyst.email });
    if (conversation.focusTicket) {
      await this.tickets
        .setStatus({ email: analyst.email, role: "analyst" }, conversation.focusTicket, "em_atendimento", `Assumido por ${analyst.name}.`)
        .catch(() => undefined); // o status do chamado não pode impedir o atendimento
    }
    await this.store.appendMessage(conversation.id, { role: "system", content: `${analyst.name} assumiu · agent pausado` });
    return updated;
  }

  async returnToAgent(analyst: { email: string; name: string }, conversation: Conversation): Promise<Conversation> {
    const updated = await this.store.update(conversation.id, { status: "agent", assignedAnalyst: null, transfer: null });
    await this.store.appendMessage(conversation.id, { role: "system", content: `${analyst.name} devolveu a conversa ao agent` });
    return updated;
  }

  async close(analyst: { email: string; name: string }, conversation: Conversation): Promise<Conversation> {
    const updated = await this.store.update(conversation.id, { status: "encerrada", pendingAction: null });
    await this.store.appendMessage(conversation.id, { role: "system", content: `Atendimento encerrado por ${analyst.name}` });
    return updated;
  }

  /** Cartão de ação pendente, como aparece no chat. */
  static pendingCard(action: PendingAction): Card {
    return { kind: "pending_action", action };
  }
}

/** "D-381": curto o bastante para o funcionário citar no chat. */
const newDraftId = (): string => `D-${randomInt(100, 1000)}`;
