"use client";

import { Check, CornerDownLeft, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BLOCKING_LEVELS } from "@/server/agent/triage";
import type { DraftTicket, PendingAction, TicketSummary } from "@/server/conversations/types";
import { formatAgo, formatDay, formatDayTime, formatUntil } from "@/server/format";
import { CATEGORIES, IMPACT_LABEL, PRIORITY_LABEL, type Impact } from "@/server/tickets/schemas";
import { Dot, Field, PRIORITY_DOT, STATUS_DOT } from "../ui";

const CardShell = ({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) => (
  <div className={`w-full max-w-[808px] overflow-hidden rounded-2xl border border-line bg-white ${muted ? "opacity-70" : ""}`}>{children}</div>
);

const Eyebrow = ({ kind, id, state }: { kind: string; id: string; state: React.ReactNode }) => (
  <div className="flex items-center gap-2 pb-0.5 text-[12.5px] text-muted">
    <span className="font-medium">{kind}</span>
    <span className="size-[3px] rounded-full bg-line" />
    <span>{id}</span>
    <span className="flex-1" />
    {state}
  </div>
);

export function TicketListCard({
  tickets,
  onPick,
  disabled,
}: {
  tickets: TicketSummary[];
  onPick: (t: TicketSummary) => void;
  disabled: boolean;
}) {
  return (
    <CardShell>
      {tickets.map((t, i) => (
        <button
          key={t.number}
          disabled={disabled}
          onClick={() => onPick(t)}
          className={`flex h-[46px] w-full items-center gap-3.5 px-4 text-left enabled:hover:bg-primary/[0.04] disabled:cursor-default ${
            i > 0 ? "border-t border-line" : ""
          }`}
        >
          <span className="size-4 shrink-0 rounded-full border border-line bg-white" aria-hidden />
          <span className="w-[76px] shrink-0 text-[12.5px] font-medium text-muted">{t.number}</span>
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{t.title}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted">
            <Dot className={STATUS_DOT[t.status as keyof typeof STATUS_DOT] ?? "bg-ink/25"} />
            {t.statusLabel}
            {t.sla.overdue && <span className="text-warning-ink">· vencido</span>}
          </span>
          <span className="w-11 shrink-0 text-right text-[12.5px] text-muted">{formatDay(t.createdAt)}</span>
        </button>
      ))}
    </CardShell>
  );
}

export function TicketCard({ ticket: t }: { ticket: TicketSummary }) {
  const now = new Date();
  const open = !["resolvido", "cancelado"].includes(t.status);
  return (
    <CardShell>
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <Eyebrow
          kind="Chamado"
          id={t.number}
          state={
            <span className="flex items-center gap-1.5 font-medium text-warning-ink">
              <Dot className={STATUS_DOT[t.status as keyof typeof STATUS_DOT] ?? "bg-ink/25"} />
              <span className={t.status === "aguardando_analista" ? "text-warning-ink" : "text-body"}>{t.statusLabel}</span>
            </span>
          }
        />
        <h3 className="text-[18px] leading-[23px] font-semibold">{t.title}</h3>
        <p className="text-[13.5px] leading-5 text-body">{t.description}</p>
      </div>
      <div className="mx-[18px] grid grid-cols-4 gap-6 border-t border-line pt-3 pb-4">
        <Field label="Categoria">{t.category}</Field>
        <Field label="Prioridade">
          <Dot className={PRIORITY_DOT[t.priority]} />
          {PRIORITY_LABEL[t.priority]}
        </Field>
        <Field label="Aberto em">{formatDayTime(t.createdAt)}</Field>
        {open ? (
          <Field label="Última atualização">
            <span className={t.sla.overdue ? "text-warning-ink" : ""}>{formatAgo(t.lastSupportUpdateAt, now)}</span>
            <span className="text-[13.5px] font-normal text-muted">
              {t.sla.overdue ? "· prazo vencido" : `· resposta ${formatUntil(t.sla.dueAt, now)}`}
            </span>
          </Field>
        ) : (
          <Field label="Situação">{t.statusLabel}</Field>
        )}
      </div>
    </CardShell>
  );
}

type PendingProps = {
  action: PendingAction;
  active: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: (edits: Partial<DraftTicket>) => Promise<boolean>;
};

const BLOCKING_LABEL: Record<(typeof BLOCKING_LEVELS)[number], string> = {
  parado: "Não consigo trabalhar",
  atrapalha: "Atrapalha, mas há alternativa",
  sem_urgencia: "Sem urgência (pedido ou melhoria)",
};

export function PendingCard({ action, active, busy, onConfirm, onCancel, onEdit }: PendingProps) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!active || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, editing, busy, onConfirm]);

  const state = active ? (
    <span className="flex items-center gap-1.5 font-medium text-warning-ink">
      <Dot className="bg-warning" />
      Aguardando confirmação
    </span>
  ) : (
    <span className="font-medium text-muted">Não está mais pendente</span>
  );

  if (action.kind === "update") {
    return (
      <CardShell muted={!active}>
        <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
          <Eyebrow kind={action.mode === "reabertura" ? "Reabertura de chamado" : "Atualização de chamado"} id={`Rascunho ${action.id}`} state={state} />
          <h3 className="text-[18px] leading-[23px] font-semibold">
            {action.ticketNumber} · {action.ticketTitle}
          </h3>
          <p className="text-[13.5px] leading-5 text-body">{action.message}</p>
        </div>
        {action.reclassify && (
          <div className="mx-[18px] grid grid-cols-3 gap-6 border-t border-line pt-3 pb-4">
            <Field label="Nova prioridade">
              <Dot className={PRIORITY_DOT[action.reclassify.priority]} />
              {PRIORITY_LABEL[action.reclassify.priority]}
            </Field>
            <div className="col-span-2">
              <Field label="Motivo">{action.reclassify.rule}</Field>
            </div>
          </div>
        )}
        {active && <Actions busy={busy} onConfirm={onConfirm} onCancel={onCancel} />}
      </CardShell>
    );
  }

  const d = action.draft;
  return (
    <CardShell muted={!active}>
      {editing ? (
        <DraftEditor
          draft={d}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (edits) => {
            if (await onEdit(edits)) setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
            <Eyebrow kind={d.type === "REQ" ? "Nova requisição" : "Novo chamado"} id={`Rascunho ${action.id}`} state={state} />
            <h3 className="text-[18px] leading-[23px] font-semibold">{d.title}</h3>
            <p className="text-[13.5px] leading-5 text-body">{d.description}</p>
          </div>
          <div className="mx-[18px] grid grid-cols-3 gap-6 border-t border-line pt-3 pb-4">
            <Field label="Categoria">{d.category}</Field>
            <Field label="Prioridade">
              <Dot className={PRIORITY_DOT[d.priority]} />
              {PRIORITY_LABEL[d.priority]}
              <span className="truncate text-[13.5px] font-normal text-muted">· resposta {formatUntil(d.sla.dueAt, new Date())}</span>
            </Field>
            <Field label="Afetados">{IMPACT_LABEL[d.impact]}</Field>
          </div>
          {active && <Actions busy={busy} onConfirm={onConfirm} onCancel={onCancel} onEdit={() => setEditing(true)} />}
        </>
      )}
    </CardShell>
  );
}

function Actions({ busy, onConfirm, onCancel, onEdit }: { busy: boolean; onConfirm: () => void; onCancel: () => void; onEdit?: () => void }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(isMac()), []);
  return (
    <div className="flex items-center gap-1.5 bg-surface py-2 pr-3.5 pl-2">
      <button
        onClick={onConfirm}
        disabled={busy}
        className="flex h-9 items-center gap-2 rounded-lg bg-primary pr-2.5 pl-3.5 text-[13.5px] font-semibold text-white hover:bg-[#0056ad] disabled:opacity-60"
      >
        <Check className="size-4" />
        {busy ? "Enviando…" : "Confirmar"}
        <kbd className="flex items-center gap-0.5 rounded-md bg-white/15 px-1.5 py-px text-[11.5px] font-normal text-white/80">
          {mac ? "⌘" : "Ctrl"} <CornerDownLeft className="size-3" />
        </kbd>
      </button>
      {onEdit && (
        <button onClick={onEdit} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13.5px] font-medium hover:bg-surface">
          <Pencil className="size-3.5" />
          Editar
        </button>
      )}
      <button onClick={onCancel} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium text-body hover:bg-white">
        <X className="size-4" />
        Cancelar
      </button>
    </div>
  );
}

function DraftEditor({
  draft,
  busy,
  onSave,
  onCancel,
}: {
  draft: DraftTicket;
  busy: boolean;
  onSave: (edits: Partial<DraftTicket>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: draft.title,
    description: draft.description,
    category: draft.category,
    impact: draft.impact,
    blocking: draft.blocking,
    deadlineToday: draft.deadlineToday,
  });
  const input = "rounded-lg border border-line px-3 py-2 text-[14px] outline-none focus:border-primary focus:ring-3 focus:ring-primary/15";
  const label = "flex flex-col gap-1 text-[12.5px] text-muted";

  return (
    <form
      className="flex flex-col gap-3 px-[18px] py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <p className="text-[12.5px] font-medium text-muted">Editando o rascunho · a prioridade e o prazo são recalculados ao salvar</p>
      <label className={label}>
        Título
        <input className={input} value={form.title} minLength={5} maxLength={90} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label className={label}>
        Descrição
        <textarea
          className={`${input} min-h-20 resize-y`}
          value={form.description}
          minLength={10}
          maxLength={600}
          required
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className={label}>
          Categoria
          <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DraftTicket["category"] })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Quem é afetado
          <select className={input} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value as Impact })}>
            {(Object.keys(IMPACT_LABEL) as Impact[]).map((i) => (
              <option key={i} value={i}>
                {IMPACT_LABEL[i]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Situação
          <select className={input} value={form.blocking} onChange={(e) => setForm({ ...form, blocking: e.target.value as DraftTicket["blocking"] })}>
            {BLOCKING_LEVELS.map((b) => (
              <option key={b} value={b}>
                {BLOCKING_LABEL[b]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13.5px] text-body">
        <input type="checkbox" checked={form.deadlineToday} onChange={(e) => setForm({ ...form, deadlineToday: e.target.checked })} />
        Tenho um compromisso hoje que depende disso
      </label>
      <div className="flex gap-1.5">
        <button type="submit" disabled={busy} className="h-9 rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-body hover:bg-surface">
          Voltar
        </button>
      </div>
    </form>
  );
}

const isMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
