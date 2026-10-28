import type { Metadata } from "next";
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
