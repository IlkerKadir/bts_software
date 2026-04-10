import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTS Teklif Yönetim Sistemi",
  description: "Teklif hazırlama ve takip sistemi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
