import { KeyRound, Lock, Mail, RotateCcwKey } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { requireSession } from "@/server/auth/current";
import { getContainer } from "@/server/container";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await requireSession("employee");
  const { tickets } = await getContainer();
  const employee = await tickets.getEmployee({ email: session.email, role: "employee" }, session.email).catch(() => null);

  const rows: [string, React.ReactNode][] = [
    ["Nome", session.name],
    [
      "E-mail corporativo",
      <span key="e" className="flex flex-col gap-0.5">
        {session.email}
        <span className="flex items-center gap-1 text-[12.5px] font-normal text-muted">
          <Lock className="size-3" /> Gerenciado pela TI
        </span>
      </span>,
    ],
    ["Área", employee?.department ?? "—"],
    ["Equipamento", employee?.device ?? "—"],
  ];

  return (
    <>
      <TopBar here="Meu perfil" />
      <main className="flex flex-col items-center overflow-y-auto px-10 py-12">
        <div className="flex w-full max-w-[600px] flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold">Meu perfil</h1>
            <p className="text-[14.5px] text-muted">Seus dados de acesso ao service desk de TI.</p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-line">
            {rows.map(([k, v], i) => (
              <div key={k} className={`flex gap-4 px-6 py-5 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="w-40 shrink-0 text-[13.5px] text-muted">{k}</span>
                <span className="text-[14.5px] font-medium">{v}</span>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="flex items-center gap-4 p-6">
              <span className="grid size-10 place-items-center rounded-full bg-surface">
                <KeyRound className="size-4 text-body" />
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">Senha</span>
                <span className="text-[13.5px] text-muted">Ambiente de demonstração: senha única, definida no servidor</span>
              </span>
              <button
                disabled
                className="flex h-9 items-center gap-[7px] rounded-lg border border-line pr-3.5 pl-3 text-[13.5px] font-medium text-muted"
                title="Indisponível na demonstração"
              >
                <RotateCcwKey className="size-4" />
                Redefinir senha
              </button>
            </div>
            <p className="flex items-start gap-2 bg-surface px-6 py-3 text-[13px] text-muted">
              <Mail className="mt-0.5 size-3.5 shrink-0" />
              Em produção, a senha seria a da rede Nexo (login corporativo) e o link de redefinição iria para {session.email}.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
