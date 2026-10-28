import { ChevronRight } from "lucide-react";

export function TopBar({ here, children }: { here: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-8">
      <nav className="flex items-center gap-2 text-[13.5px]">
        <span className="text-muted">Service desk de TI</span>
        <ChevronRight className="size-3.5 text-muted" />
        <span className="font-semibold">{here}</span>
      </nav>
      <div className="flex-1" />
      {children}
    </header>
  );
}
