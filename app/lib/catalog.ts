import { LayoutDashboard, Inbox, NotebookPen, BookOpen, CheckSquare2, FolderKanban, CalendarDays, Bookmark, FolderOpen, Image as ImageIcon, Wallet, ContactRound, Star, Archive, Trash2, Settings2, Activity as ActivityIcon, type LucideIcon } from "lucide-react";
import type { View } from "./model";
export type Module = { id: View; name: string; icon: LucideIcon; description: string; color: string };
export const modules: Module[] = [
  { id: "overview", name: "空间总览", icon: LayoutDashboard, description: "从这里，开始今天的节奏。", color: "green" },
  { id: "inbox", name: "收集箱", icon: Inbox, description: "先留住，再慢慢整理。", color: "orange" },
  { id: "note", name: "笔记", icon: NotebookPen, description: "让零散的想法，逐渐有迹可循。", color: "blue" },
  { id: "journal", name: "日记", icon: BookOpen, description: "记录生活的细节，也留一点空间给自己。", color: "purple" },
  { id: "task", name: "待办事项", icon: CheckSquare2, description: "把重要的事，一件一件完成。", color: "green" },
  { id: "project", name: "项目", icon: FolderKanban, description: "从一个想法，到一次完成。", color: "orange" },
  { id: "event", name: "日历", icon: CalendarDays, description: "给时间以安排，也给生活留白。", color: "blue" },
  { id: "bookmark", name: "网页收藏", icon: Bookmark, description: "保存值得再次打开的内容。", color: "purple" },
  { id: "file", name: "文件库", icon: FolderOpen, description: "让每一份资料，都有自己的位置。", color: "blue" },
  { id: "photo", name: "相册", icon: ImageIcon, description: "收好那些想要留下的瞬间。", color: "orange" },
  { id: "expense", name: "个人账本", icon: Wallet, description: "看清每一笔收支，了解自己的生活。", color: "green" },
  { id: "contact", name: "联系人", icon: ContactRound, description: "记下联系，也记下关于彼此的细节。", color: "purple" },
];
export const extraModules: Module[] = [
  { id: "favorites", name: "星标内容", icon: Star, description: "重要的东西，放在触手可及的地方。", color: "orange" },
  { id: "archive", name: "已归档", icon: Archive, description: "已经告一段落，依然值得保存。", color: "blue" },
  { id: "trash", name: "回收站", icon: Trash2, description: "移入回收站的内容会保留，直到你决定彻底删除。", color: "orange" },
  { id: "activity", name: "操作记录", icon: ActivityIcon, description: "最近 40 次内容操作，留下清晰的足迹。", color: "green" },
  { id: "settings", name: "空间设置", icon: Settings2, description: "按照自己的习惯，调整这个空间。", color: "blue" },
];
export const moduleFor = (id: string) => [...modules, ...extraModules].find(m => m.id === id) || modules[0];
