import { requireSession } from "@/server/auth/current";

/** Console do analista (telas 4 e 5) — construído na Etapa 4. */
export default async function ConsolePage() {
  const session = await requireSession("analyst");
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-xl font-bold">Console do analista</h1>
        <p className="text-muted">Olá, {session.name}. O console chega na próxima etapa.</p>
      </div>
    </main>
  );
}
