import {
  defaultPreferences,
  type Activity,
  type Kind,
  type Preferences,
  type SpaceRecord,
  type Collection,
  type View,
} from "./model";
export type Count = {
  kind: Kind;
  status: string;
  favorite: number;
  deleted: number;
  count: number;
};
/** Shared active counts exclude trash and archived records unless that view is requested. */
export function countByKind(counts: Count[], kind: Kind, status?: string) {
  return counts
    .filter(
      (c) =>
        !c.deleted &&
        c.status !== "archived" &&
        c.kind === kind &&
        (!status || c.status === status),
    )
    .reduce((sum, c) => sum + c.count, 0);
}
export function countByView(counts: Count[], view: View) {
  return counts
    .filter((c) =>
      view === "trash"
        ? !!c.deleted
        : !c.deleted &&
          (view === "archive"
            ? c.status === "archived"
            : c.status !== "archived" && (view === "favorites" ? !!c.favorite : c.kind === view)),
    )
    .reduce((sum, c) => sum + c.count, 0);
}
export type LedgerData = {
  count: number;
  incomeCents: number;
  expenseCents: number;
  categories: { name: string; cents: number }[];
  months: { month: string; incomeCents: number; expenseCents: number }[];
};
export type Data = {
  ledger: LedgerData;
  items: SpaceRecord[];
  recent: SpaceRecord[];
  onThisDay: SpaceRecord[];
  activity: Activity[];
  preferences: Preferences;
  counts: Count[];
  dueTasks: SpaceRecord[];
  upcoming: SpaceRecord[];
  pinned: SpaceRecord[];
  collections: Collection[];
  tags: { name: string; count: number }[];
  total: number;
  stats: { fileBytes: number; unread: number; overdue: number };
  projectTasks: { projectId: string; total: number; done: number }[];
  nextCursor: string | null;
};
export const initialData: Data = {
  ledger: { count: 0, incomeCents: 0, expenseCents: 0, categories: [], months: [] },
  items: [],
  recent: [],
  onThisDay: [],
  activity: [],
  preferences: defaultPreferences,
  counts: [],
  dueTasks: [],
  upcoming: [],
  pinned: [],
  collections: [],
  tags: [],
  total: 0,
  stats: { fileBytes: 0, unread: 0, overdue: 0 },
  projectTasks: [],
  nextCursor: null,
};
/** Centralized API handling never turns an unsuccessful write into a success toast. */
export async function api<T = Record<string, unknown>>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const result = (await response.json().catch(() => ({ error: "服务响应异常" }))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(result.error || "请求失败");
  return result;
}
export const formatDate = (value: string | null, full = false) =>
  value
    ? new Date(value).toLocaleDateString(
        "zh-CN",
        full
          ? { year: "numeric", month: "long", day: "numeric" }
          : { month: "2-digit", day: "2-digit" },
      )
    : "未设置";
export const formatTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export const fileSize = (value: unknown) => {
  const n = Number(value) || 0;
  return n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
};
