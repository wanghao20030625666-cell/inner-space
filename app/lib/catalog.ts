import {
  LayoutDashboard,
  Inbox,
  NotebookPen,
  BookOpen,
  CheckSquare2,
  FolderKanban,
  CalendarDays,
  Bookmark,
  FolderOpen,
  Image as ImageIcon,
  Wallet,
  ContactRound,
  Star,
  Archive,
  Trash2,
  Settings2,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import type { View } from "./model";
export type Module = {
  id: View;
  name: string;
  icon: LucideIcon;
  description: string;
  color: string;
};
export const modules: Module[] = [
  {
    id: "overview",
    name: "主页",
    icon: LayoutDashboard,
    description: "最近的记录、要做的事和日程。",
    color: "green",
  },
  {
    id: "inbox",
    name: "收集箱",
    icon: Inbox,
    description: "临时记下的内容，可以整理成笔记、待办或收藏。",
    color: "orange",
  },
  {
    id: "note",
    name: "笔记",
    icon: NotebookPen,
    description: "写作、工作记录和查过的资料。",
    color: "blue",
  },
  {
    id: "journal",
    name: "日记",
    icon: BookOpen,
    description: "按日期查看自己的记录。",
    color: "purple",
  },
  {
    id: "task",
    name: "待办",
    icon: CheckSquare2,
    description: "安排下一步，查看进度和截止日期。",
    color: "green",
  },
  {
    id: "project",
    name: "项目",
    icon: FolderKanban,
    description: "把相关的待办放在一起，跟进完成情况。",
    color: "orange",
  },
  {
    id: "event",
    name: "日历",
    icon: CalendarDays,
    description: "约定的时间、地点和需要提前准备的事。",
    color: "blue",
  },
  {
    id: "bookmark",
    name: "网页收藏",
    icon: Bookmark,
    description: "保存链接，区分待读和已读。",
    color: "purple",
  },
  {
    id: "file",
    name: "文件库",
    icon: FolderOpen,
    description: "上传资料，按专题和标签查找。",
    color: "blue",
  },
  {
    id: "photo",
    name: "相册",
    icon: ImageIcon,
    description: "照片、截图和其他图片。",
    color: "orange",
  },
  {
    id: "expense",
    name: "账本",
    icon: Wallet,
    description: "记录收入、支出和用途。",
    color: "green",
  },
  {
    id: "contact",
    name: "联系人",
    icon: ContactRound,
    description: "联系方式和相处时记下的事情。",
    color: "purple",
  },
];
export const extraModules: Module[] = [
  {
    id: "favorites",
    name: "星标",
    icon: Star,
    description: "所有加过星标的内容。",
    color: "orange",
  },
  {
    id: "archive",
    name: "归档",
    icon: Archive,
    description: "暂时不用、仍需保留的内容。",
    color: "blue",
  },
  {
    id: "trash",
    name: "回收站",
    icon: Trash2,
    description: "可以恢复；彻底删除后无法找回。",
    color: "orange",
  },
  {
    id: "activity",
    name: "操作记录",
    icon: ActivityIcon,
    description: "最近 40 次内容操作。",
    color: "green",
  },
  {
    id: "settings",
    name: "设置",
    icon: Settings2,
    description: "空间名称、外观、账户和数据导出。",
    color: "blue",
  },
];
export const moduleFor = (id: string) =>
  [...modules, ...extraModules].find((m) => m.id === id) || modules[0];
