import type { Metadata } from "next";
import "./globals.css";
import { getChatGPTUser } from "./chatgpt-auth";
import { loadPreferences } from "./lib/preferences.server";

export const metadata: Metadata = {
  title: "隐序 · 私人空间",
  description: "隐序个人工作台：管理笔记、待办、专题、收藏和日常资料。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getChatGPTUser(),
    preferences = user ? await loadPreferences(user.userId) : null;
  return (
    <html lang="zh-CN" data-theme={preferences?.theme || "light"}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
