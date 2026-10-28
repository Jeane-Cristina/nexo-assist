import { createInterface } from "node:readline/promises";
import { handleEmployeeMessage } from "../src/server/agent/run-turn";
import { getContainer } from "../src/server/container";
import type { Message } from "../src/server/conversations/types";
import { INTENT_LABEL } from "../src/server/conversations/types";

const c = { dim: "\x1b[2m", bold: "\x1b[1m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", reset: "\x1b[0m" };

const container = await getContainer();
const email = process.env.CHAT_AS ?? "ana.souza@nexo.com.br";
const actor = { email, role: "employee" as const };
const employee = await container.tickets.getEmployee(actor, email);
let conversation = (await container.store.findActiveForEmployee(email)) ?? (await container.store.create({ email, name: employee.name }));

function print(m: Message) {
  if (m.role === "employee") return;
  if (m.role === "system") return console.log(`${c.dim}── ${m.content} ──${c.reset}`);
  const d = m.meta.decision;
  if (m.meta.steps?.length) console.log(`${c.dim}${m.authorName} · ${m.meta.steps.map((s) => (s.ok ? "✓ " : "✗ ") + s.label).join("  ")}${c.reset}`);
  console.log(`${c.cyan}${m.content}${c.reset}`);
  for (const card of m.meta.cards ?? []) {
    if (card.kind === "pending_action" && card.action.kind === "create") {
      const dr = card.action.draft;
      console.log(`${c.yellow}  ┌ Rascunho ${card.action.id} · aguardando confirmação\n  │ ${dr.title}\n  │ ${dr.category} · prioridade ${dr.priority} (${dr.priorityRule}) · prazo ${dr.sla.label}\n  └ /confirmar ou /cancelar${c.reset}`);
    } else if (card.kind === "pending_action" && card.action.kind === "update") {
      console.log(`${c.yellow}  ┌ ${card.action.mode} do ${card.action.ticketNumber} (${card.action.id})\n  │ ${card.action.message}\n  └ /confirmar ou /cancelar${c.reset}`);
    } else if (card.kind === "ticket") {
      console.log(`${c.yellow}  [${card.ticket.number}] ${card.ticket.title} · ${card.ticket.statusLabel}${card.ticket.sla.overdue ? " · prazo vencido" : ""}${c.reset}`);
    } else if (card.kind === "ticket_list") {
      for (const t of card.tickets) console.log(`${c.yellow}  ○ ${t.number} · ${t.title} · ${t.statusLabel}${c.reset}`);
    }
  }
  if (m.meta.quickReplies?.length) console.log(`${c.dim}  opções: ${m.meta.quickReplies.join(" | ")}${c.reset}`);
  if (d) {
    const conf = d.confidence === null ? "não informada" : `${Math.round(d.confidence * 100)}%`;
    console.log(`${c.dim}  ↳ ${INTENT_LABEL[d.intent]} · ${d.action} · confiança ${conf} · ${d.reason}${c.reset}`);
    for (const r of d.rules) console.log(`${c.dim}    regra: ${r}${c.reset}`);
    for (const g of d.guardrails) console.log(`${c.red}    barreira: ${g}${c.reset}`);
  }
}

console.log(`${c.bold}Nexo Assist${c.reset} — você é ${employee.name} (${employee.device ?? "sem equipamento"}). Modelo: ${process.env.LLM_MODEL ?? "google/gemini-3.5-flash-lite"}${process.env.LLM_FALLBACK_MODEL ? ` (reserva: ${process.env.LLM_FALLBACK_MODEL})` : ""}`);
for (const m of await container.store.listMessages(conversation.id, { last: 6 })) {
  if (m.role === "employee") console.log(`${c.bold}você:${c.reset} ${m.content}`);
  else print(m);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
for (;;) {
  const text = (await rl.question(`${c.bold}você:${c.reset} `)).trim();
  if (!text) continue;
  if (text === "/sair") break;
  if (text === "/nova") {
    conversation = await container.store.create({ email, name: employee.name });
    console.log(`${c.dim}── nova conversa ──${c.reset}`);
    continue;
  }
  if (text === "/cancelar") {
    conversation = await container.desk.cancelPending(conversation);
    console.log(`${c.dim}── rascunho descartado ──${c.reset}`);
    continue;
  }
  if (text === "/confirmar") {
    const pending = conversation.pendingAction;
    if (!pending) {
      console.log(`${c.dim}── não há rascunho pendente ──${c.reset}`);
      continue;
    }
    try {
      const outcome = await container.desk.confirmPending(actor, conversation, pending.id);
      console.log(`${c.cyan}${outcome.summary}${c.reset}`);
      if (outcome.autoTransfer) console.log(`${c.dim}── transferido para um analista (chamado crítico) ──${c.reset}`);
    } catch (err) {
      console.log(`${c.red}${err instanceof Error ? err.message : String(err)}${c.reset}`);
    }
    conversation = await container.store.require(conversation.id);
    continue;
  }
  const started = Date.now();
  const result = await handleEmployeeMessage(container, { conversation, employee, text });
  conversation = result.conversation;
  for (const m of result.messages) print(m);
  if (result.kind === "paused") console.log(`${c.dim}── conversa com um analista: o agent está pausado ──${c.reset}`);
  console.log(`${c.dim}  (${((Date.now() - started) / 1000).toFixed(1)}s · ${conversation.employeeMessageCount}/30 mensagens)${c.reset}`);
}
rl.close();
process.exit(0);
