import { ArrowRightLeft, Bot, CircleCheckBig, Headset, type LucideIcon } from "lucide-react";

/** Ícone do marco na linha do tempo, como no protótipo. */
export function systemIcon(content: string): LucideIcon | null {
  if (content.startsWith("Transferida")) return ArrowRightLeft;
  if (content.includes("assumiu")) return Headset;
  if (content.includes("devolveu")) return Bot;
  if (content.startsWith("Atendimento encerrado")) return CircleCheckBig;
  return null;
}

