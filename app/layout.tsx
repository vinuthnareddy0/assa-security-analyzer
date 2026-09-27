import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASSA — Attack Surface Security Analyzer",
  description: "Map and assess authorized external assets.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
