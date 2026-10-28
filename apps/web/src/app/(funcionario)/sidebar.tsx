"use client";

import { LogOut, MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NexoMark } from "@/components/nexo-mark";
import { initials } from "@/components/ui";

const NAV = [
  { href: "/atendimento", label: "Atendimento", icon: MessageSquare },
  { href: "/perfil", label: "Meu perfil", icon: UserRound },
];

export function Sidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line px-3.5 pt-5 pb-3.5">
      <div className="flex items-center gap-2.5 px-2">
        <NexoMark size={20} color="#1B2431" />
        <span className="text-base font-bold">Nexo Assist</span>
      </div>

      <nav className="mt-[22px] flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] ${
                active ? "bg-primary-tint font-semibold text-link" : "font-medium text-body hover:bg-surface"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 border-t border-line px-2 pt-3.5 pb-1">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primary-tint text-[12.5px] font-bold text-link">
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-semibold">{name}</span>
          <span className="truncate text-[11.5px] text-muted">{email}</span>
        </span>
      </div>
      <button
        onClick={logout}
        className="mt-1 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-body hover:bg-surface"
      >
        <LogOut className="size-4" />
        Sair
      </button>
    </aside>
  );
}
