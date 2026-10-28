import { requireSession } from "@/server/auth/current";
import { Sidebar } from "./sidebar";

/** Área logada do funcionário: barra lateral fixa + conteúdo. */
export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("employee");
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar name={session.name} email={session.email} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
