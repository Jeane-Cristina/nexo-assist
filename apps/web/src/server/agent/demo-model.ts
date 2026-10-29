import type { MastraModelConfig } from "@mastra/core/llm";

export const DEMO_MODEL_ID = "demo/roteiro";

type Part = { type: string; text?: string; toolName?: string; output?: unknown };
type PromptMessage = { role: string; content: string | Part[] };
type ToolCall = { tool: string; args: Record<string, unknown> };

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const decision = (intencao: string, acao: string, motivo: string, opcoesRapidas: string[] = []): ToolCall => ({
  tool: "registrar_decisao",
  args: { intencao, acao, confianca: 0.92, motivo, opcoesRapidas },
});

function lastUserText(prompt: PromptMessage[]): string {
  const msg = [...prompt].reverse().find((m) => m.role === "user");
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content.map((p) => p.text ?? "").join(" ");
}

function lastToolName(prompt: PromptMessage[]): string | null {
  const last = prompt.at(-1);
  if (!last || last.role !== "tool" || typeof last.content === "string") return null;
  const names = last.content.map((p) => p.toolName).filter((n): n is string => Boolean(n) && n !== "registrar_decisao");
  return names[0] ?? "registrar_decisao";
}

function pendingDraftId(prompt: PromptMessage[]): string | null {
  const system = prompt.find((m) => m.role === "system");
  const text = typeof system?.content === "string" ? system.content : (system?.content ?? []).map((p) => p.text ?? "").join(" ");
  return /Rascunho pendente: (D-\d+)/.exec(text)?.[1] ?? null;
}

function plan(text: string, draftId: string | null): ToolCall[] {
  const t = text.toLowerCase();
  if (draftId && /^(confirm|pode criar|pode abrir|sim\b)/.test(t.trim())) {
    return [
      { tool: "confirmar_acao_pendente", args: { rascunhoId: draftId } },
      decision("confirmar_acao", "Abri o chamado", "Você confirmou o rascunho, então abri o chamado."),
    ];
  }
  if (/analista|pessoa|humano/.test(t)) {
    return [
      decision("falar_com_analista", "Chamei um analista", "Você pediu para falar com uma pessoa, então passei a conversa para a equipe."),
      {
        tool: "transferir_para_analista",
        args: {
          motivo: "pedido_do_funcionario",
          resumo: "Funcionária pediu para falar com um analista sobre o Excel que fecha sozinho ao abrir planilhas grandes.",
        },
      },
    ];
  }
  if (/excel|planilha/.test(t)) {
    return [
      {
        tool: "preparar_rascunho_chamado",
        args: {
          tipo: "INC",
          titulo: "Excel fecha sozinho ao abrir planilhas grandes",
          descricao: "O Excel fecha sem aviso ao abrir planilhas grandes. Só afeta a funcionária, que consegue trabalhar com arquivos menores.",
          categoria: "Software",
          impacto: "individual",
          bloqueio: "atrapalha",
          compromissoHoje: false,
        },
      },
      decision("abrir_chamado", "Montei o rascunho do chamado", "Não achei solução na central, então preparei um chamado para você conferir.", ["Confirmar", "Falar com analista"]),
    ];
  }
  return [];
}

const FINAL_TEXT: Record<string, string> = {
  preparar_rascunho_chamado:
    "Preparei o rascunho abaixo. A prioridade ficou média porque só você é afetada e dá para seguir trabalhando. Confira e confirme para eu abrir o chamado.",
  confirmar_acao_pendente: "Pronto, abri o chamado. Você acompanha o andamento por aqui.",
  transferir_para_analista: "Pronto, chamei um analista. Ele vai continuar esta conversa aqui mesmo.",
};

export function createDemoModel(): MastraModelConfig {
  let id = 0;
  const model = {
    specificationVersion: "v3" as const,
    provider: "demo",
    modelId: "roteiro",
    supportedUrls: {},
    doGenerate: async (options: { prompt: PromptMessage[] }) => {
      const tool = lastToolName(options.prompt);
      if (tool) {
        const text = FINAL_TEXT[tool] ?? "Certo.";
        return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
      }
      const calls = plan(lastUserText(options.prompt), pendingDraftId(options.prompt));
      if (calls.length === 0) {
        const text = "Este é o modo de demonstração, sem IA. Experimente: \"O Excel fecha sozinho\" ou \"Quero falar com um analista\".";
        return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
      }
      return {
        content: calls.map((c) => ({ type: "tool-call" as const, toolCallId: `demo-${++id}`, toolName: c.tool, input: JSON.stringify(c.args) })),
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error("O modelo de demonstração não suporta streaming.");
    },
  };
  return model as unknown as MastraModelConfig;
}
