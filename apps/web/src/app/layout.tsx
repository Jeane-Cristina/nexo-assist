import type { Metadata } from "next";
// Fontes do protótipo, empacotadas com o app (sem depender de baixar do Google em tempo de build,
// o que falha em redes corporativas com proxy): Newsreader nos títulos, Schibsted Grotesk no resto.
import "@fontsource-variable/newsreader";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexo Assist · Service desk de TI",
  description: "Seu problema de TI, resolvido em uma conversa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
