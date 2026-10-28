import { ConsoleScreen } from "@/components/console/console-screen";
import { requireSession } from "@/server/auth/current";
import { listConversations } from "@/server/chat/analyst-console";
import { getContainer } from "@/server/container";
import { touchPresence } from "@/server/stats";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const session = await requireSession("analyst");
  const container = await getContainer();
  await touchPresence(container.db, session.email);
  const initialList = await listConversations(container, session, { filter: "para_voce" });
  return <ConsoleScreen me={{ email: session.email, name: session.name }} initialList={initialList} />;
}
