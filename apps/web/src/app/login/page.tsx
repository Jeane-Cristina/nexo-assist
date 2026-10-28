import { redirect } from "next/navigation";
import { NexoMark } from "@/components/nexo-mark";
import { getSession, homeFor } from "@/server/auth/current";
import { getContainer } from "@/server/container";
import { getStats, type ServiceDeskStats } from "@/server/stats";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));
  const stats = await loadStats();

  return (
    <main className="flex min-h-screen">
      <section className="hidden w-[55%] flex-col justify-between bg-ink px-16 pt-10 pb-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark size={24} color="#fff" />
          <span className="text-[17px] font-bold tracking-[-0.2px]">Nexo Assist</span>
        </div>

        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-4.5">
            <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
            <h1 className="font-serif text-[54px] leading-[56px]">Seu problema de TI, resolvido em uma conversa.</h1>
            <p className="max-w-[520px] text-base leading-[25px] text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
              analista quando precisa.
            </p>
          </div>

          <div className="pl-24">
            <div className="flex w-[500px] flex-col gap-2.5 rounded-2xl bg-white/[0.04] p-4.5">
              <div className="flex justify-end">
                <p className="rounded-[12px_12px_4px_12px] bg-white px-3.5 py-2 text-[13.5px] text-ink">
                  Meu notebook não conecta na VPN. Erro 809.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[12.5px]">
                  <span className="font-semibold text-white/80">Nexo Assist</span>
                  <span className="text-white/45"> · consultou seus chamados · criou um chamado</span>
                </p>
                <p className="w-[380px] rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px] leading-5">
                  Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
                </p>
                <div className="flex w-fit items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-[12.5px]">
                  <span className="size-[7px] rounded-full bg-warning" />
                  <span className="font-semibold text-ink">INC-20517</span>
                  <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Stats stats={stats} />
      </section>

      <section className="flex flex-1 flex-col justify-between px-14 py-10">
        <p className="text-right text-[13.5px] text-muted">
          Problema para entrar? <span className="font-semibold text-link">Ligue no ramal 4000</span>
        </p>

        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-[40px] leading-[44px]">Entrar</h2>
            <p className="text-[15.5px] leading-[23px] text-muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>
          </div>
          <LoginForm />
          <div className="rounded-lg bg-surface px-3.5 py-3 text-[12.5px] leading-[18px] text-muted">
            <strong className="font-semibold text-body">Ambiente de demonstração.</strong> Funcionária:{" "}
            <code>ana.souza@nexo.com.br</code> · Analista: <code>rafael.lima@nexo.com.br</code> · senha de demonstração no README.
          </div>
        </div>

        <div className="flex justify-between text-[12.5px] text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </section>
    </main>
  );
}

async function loadStats(): Promise<ServiceDeskStats | null> {
  try {
    return await getStats((await getContainer()).db);
  } catch {
    return null;
  }
}

const formatSeconds = (s: number): string => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);

function Stats({ stats }: { stats: ServiceDeskStats | null }) {
  const items: { value: string; label: string; live?: boolean }[] = [
    { value: stats?.avgFirstResponseSeconds != null ? formatSeconds(stats.avgFirstResponseSeconds) : "—", label: "primeira resposta, em média" },
    { value: stats?.resolvedWithoutQueuePct != null ? `${stats.resolvedWithoutQueuePct}%` : "—", label: "resolvidos sem fila" },
    { value: String(stats?.analystsOnline ?? 0), label: "analistas online agora", live: (stats?.analystsOnline ?? 0) > 0 },
  ];
  return (
    <div className="flex max-w-[672px] border-t border-white/10 pt-6">
      {items.map((it, i) => (
        <div key={it.label} className={`flex flex-1 flex-col gap-1.5 ${i > 0 ? "border-l border-white/10 pl-6" : ""}`}>
          <span className="flex items-center gap-2 font-serif text-[34px] leading-none">
            {it.value}
            {it.live && <span className="size-2 rounded-full bg-success" />}
          </span>
          <span className="text-[13.5px] text-white/55">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
