import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Full Hub",
  description: "Plataforma da agência — painel interno e portal do cliente.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
