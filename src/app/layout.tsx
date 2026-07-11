import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartMarket | Assistente Inteligente para Mercadinhos",
  description: "Gestão inteligente de estoque, validade e alertas automáticos via WhatsApp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  );
}
