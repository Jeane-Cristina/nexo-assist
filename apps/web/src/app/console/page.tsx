import { ConsoleScreen } from "@/components/console/console-screen";
import { requireSession } from "@/server/auth/current";
import { listConversations } from "@/server/chat/analyst-console";
import { getContainer } from "@/server/container";

export const dynamic = "force-dynamic";

/** Console do analista (telas 4 e 5). Abre direto na fila "Para você". */
export default async function ConsolePage() {
  const session = await requireSession("analyst");
  const initialList = await listConversations(await getContainer(), session, { filter: "para_voce" });
  return <ConsoleScreen me={{ email: session.email, name: session.name }} initialList={initialList} />;
}
