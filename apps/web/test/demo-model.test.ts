import { afterEach, beforeEach, expect, it } from "vitest";
import { createDemoModel } from "../src/server/agent/demo-model";
import { handleEmployeeMessage } from "../src/server/agent/run-turn";
import type { Conversation } from "../src/server/conversations/types";
import { ANA, createTestEnv, type TestEnv } from "./helpers";

let env: TestEnv;
let conversation: Conversation;

beforeEach(async () => {
  env = await createTestEnv();
  conversation = await env.store.create({ email: ANA.email, name: ANA.name });
});

afterEach(() => env.cleanup());

async function say(text: string) {
  const result = await handleEmployeeMessage(env.deps(createDemoModel()), { conversation, employee: ANA, text });
  conversation = result.conversation;
  return result.messages.filter((m) => m.role === "agent").at(-1)!;
}

it("modo demonstração: rascunho, confirmação e transferência sem chamar IA", async () => {
  const draft = await say("O Excel fecha sozinho com planilhas grandes");
  expect(draft.meta.decision?.intent).toBe("abrir_chamado");
  expect(conversation.pendingAction?.kind).toBe("create");

  await say("Confirmo");
  expect(conversation.pendingAction).toBeNull();
  const tickets = await env.tickets.listTickets({ email: ANA.email, role: "employee" }, { scope: "open" });
  expect(tickets.some((t) => t.title === "Excel fecha sozinho ao abrir planilhas grandes")).toBe(true);

  await say("Quero falar com um analista");
  expect(conversation.status).toBe("aguardando_atendente");
});

it("modo demonstração: mensagem fora do roteiro recebe orientação", async () => {
  const reply = await say("Bom dia");
  expect(reply.content).toContain("modo de demonstração");
});
