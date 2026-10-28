"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck, Wrench, XCircle } from "lucide-react";
import type { Decision, Step } from "@/server/conversations/types";
import { INTENT_LABEL } from "@/server/conversations/types";

export function DecisionPanel({ decision, steps }: { decision: Decision; steps: Step[] }) {
  const pct = decision.confidence === null ? null : Math.round(decision.confidence * 100);
  const barColor = pct === null ? "bg-ink/20" : pct < 45 ? "bg-danger" : pct < 70 ? "bg-warning" : "bg-success";

  return (
    <div className="flex w-full max-w-[600px] flex-col gap-4 rounded-xl border border-line bg-surface p-4 text-[13px]">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">O que entendi</span>
          <span className="font-semibold">{INTENT_LABEL[decision.intent]}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Confiança</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
              <span className={`block h-full ${barColor}`} style={{ width: `${pct ?? 0}%` }} />
            </span>
            <span className="w-24 font-semibold">{pct === null ? "não informada" : `${pct}%`}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">O que fiz</span>
        <span className="font-medium">{decision.action}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">Por quê</span>
        <span className="leading-5 text-body">{decision.reason}</span>
      </div>

      {decision.rules.length > 0 && (
        <Section title="Regras do service desk aplicadas">
          {decision.rules.map((r) => (
            <li key={r} className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success-ink" />
              <span>{r}</span>
            </li>
          ))}
        </Section>
      )}

      {decision.guardrails.length > 0 && (
        <Section title="Intervenções automáticas do sistema">
          {decision.guardrails.map((g) => (
            <li key={g} className="flex gap-2 text-warning-ink">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{g}</span>
            </li>
          ))}
        </Section>
      )}

      {steps.length > 0 && (
        <Section title="Ferramentas usadas">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                {s.ok ? <CheckCircle2 className="size-3.5 text-success-ink" /> : <XCircle className="size-3.5 text-danger-ink" />}
                <span className="font-medium">{s.label}</span>
                <span className="flex items-center gap-1 text-[11.5px] text-muted">
                  <Wrench className="size-3" />
                  {s.tool}
                </span>
              </span>
              <details className="ml-5.5 text-[12px] text-muted">
                <summary className="cursor-pointer select-none">entrada e resultado</summary>
                <pre className="mt-1 overflow-x-auto rounded-md bg-white p-2 font-mono text-[11.5px] leading-4 whitespace-pre-wrap text-body">
                  {`entrada: ${JSON.stringify(s.input, null, 1)}\nresultado: ${typeof s.output === "string" ? s.output : JSON.stringify(s.output, null, 1)}`}
                </pre>
              </details>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{title}</span>
      <ul className="flex flex-col gap-1.5 leading-5">{children}</ul>
    </div>
  );
}
