import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "隐序 · 私人空间",
  description: "一个只属于自己的空间。安放想法，整理生活，专注当下。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
