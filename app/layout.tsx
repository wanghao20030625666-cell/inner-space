import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "隐序 · 私人空间",
  description: "隐序个人工作台：管理笔记、待办、专题、收藏和日常资料。",
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
