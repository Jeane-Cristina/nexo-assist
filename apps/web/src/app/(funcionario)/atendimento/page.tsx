import { ChatScreen } from "@/components/chat/chat-screen";
import { TopBar } from "@/components/top-bar";
import { requireSession } from "@/server/auth/current";
import { ChatError, loadChat } from "@/server/chat/employee-chat";
import { getContainer } from "@/server/container";

export const dynamic = "force-dynamic";

/** Telas 2 e 3: o estado inicial já vem do servidor, sem tela piscando ao abrir. */
export default async function AtendimentoPage() {
  const session = await requireSession("employee");
  try {
    const snapshot = await loadChat(await getContainer(), session);
    return <ChatScreen initial={snapshot} />;
  } catch (err) {
    if (!(err instanceof ChatError)) throw err;
    return (
      <>
        <TopBar here="Atendimento" />
        <div className="m-8 max-w-[560px] rounded-xl bg-warning-tint p-5 text-[14px] text-warning-ink">
          {err.message} <a href="/atendimento" className="font-semibold underline">Tentar de novo</a>
        </div>
      </>
    );
  }
}
