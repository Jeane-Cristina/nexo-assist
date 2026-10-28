import type { Card, Conversation, Decision, Intent, Step } from "../conversations/types";

export type RecordedDecision = {
  intent: Intent;
  action: string;
  confidence: number;
  reason: string;
  quickReplies: string[];
};

export class TurnRecorder {
  readonly steps: Step[] = [];
  readonly rules: string[] = [];
  readonly guardrails: string[] = [];
  private cards: Card[] = [];
  decision: RecordedDecision | null = null;
  conversation: Conversation;
  transferred = false;

  constructor(
    conversation: Conversation,
    readonly startedAt: Date,
  ) {
    this.conversation = conversation;
  }

  step(tool: string, label: string, ok: boolean, input: unknown, output: unknown): void {
    this.steps.push({ tool, label, ok, input, output });
  }

  rule(text: string): void {
    if (!this.rules.includes(text)) this.rules.push(text);
  }

  guardrail(text: string): void {
    this.guardrails.push(text);
  }

  card(card: Card): void {
    this.cards = [...this.cards.filter((c) => c.kind !== card.kind), card];
  }

  finalCards(): Card[] {
    const pending = this.cards.find((c) => c.kind === "pending_action");
    if (pending) return [pending];
    const ticket = this.cards.find((c) => c.kind === "ticket");
    if (ticket) return [ticket];
    return this.cards.filter((c) => c.kind === "ticket_list");
  }

  toDecision(): Decision {
    const d = this.decision;
    return {
      intent: d?.intent ?? "indefinida",
      action: d?.action ?? "Respondeu sem registrar a decisão",
      confidence: d ? d.confidence : null,
      reason: d?.reason ?? "O agent não registrou o motivo desta resposta.",
      rules: [...this.rules],
      guardrails: [...this.guardrails],
    };
  }
}
