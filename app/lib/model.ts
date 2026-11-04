import { z } from "zod";
export const kinds = [
  "inbox",
  "note",
  "journal",
  "task",
  "project",
  "event",
  "bookmark",
  "file",
  "photo",
  "expense",
  "contact",
] as const;
export type Kind = (typeof kinds)[number];
export type View =
  Kind | "overview" | "favorites" | "archive" | "trash" | "settings" | "activity" | "collection";
export type SpaceRecord = {
  id: string;
  kind: Kind;
  title: string;
  content: string;
  tags: string[];
  meta: Record<string, string | number>;
  favorite: boolean;
  pinned: boolean;
  collectionId: string | null;
  status: "active" | "done" | "archived";
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
};
export type Collection = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  count: number;
};
export type Activity = {
  id: string;
  action: string;
  title: string;
  recordId: string | null;
  createdAt: string;
};
export type Preferences = {
  name: string;
  motto: string;
  theme: "light" | "dark";
  weekStartsMonday: boolean;
  trashRetentionDays: 0 | 30 | 90;
};
export const defaultPreferences: Preferences = {
  name: "我的空间",
  motto: "",
  theme: "light",
  weekStartsMonday: true,
  trashRetentionDays: 0,
};
export const recordInput = z
  .object({
    kind: z.enum(kinds),
    title: z.string().trim().min(1, "请填写标题").max(160),
    content: z.string().max(100000).default(""),
    tags: z.array(z.string().trim().min(1).max(24)).max(12).default([]),
    meta: z.record(z.string(), z.union([z.string().max(20000), z.number().finite()])).default({}),
    favorite: z.boolean().default(false),
    status: z.enum(["active", "done", "archived"]).default("active"),
    pinned: z.boolean().default(false),
    collectionId: z.string().uuid().nullable().default(null),
    dueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "请使用有效年月日")
      .refine(
        (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
        "日期无效",
      )
      .nullable()
      .default(null),
  })
  .superRefine((v, ctx) => {
    if (
      v.kind === "contact" &&
      v.meta.birthday &&
      (!/^\d{2}-\d{2}$/.test(String(v.meta.birthday)) || !isCalendarDate(`2000-${v.meta.birthday}`))
    )
      ctx.addIssue({
        code: "custom",
        message: "生日请使用有效月日，如 05-18",
        path: ["meta", "birthday"],
      });
    if (
      v.kind === "event" &&
      v.meta.reminderType &&
      !["none", "countdown", "subscription"].includes(String(v.meta.reminderType))
    )
      ctx.addIssue({ code: "custom", message: "提醒类型无效", path: ["meta", "reminderType"] });
    if (v.kind === "bookmark") {
      try {
        const u = new URL(String(v.meta.url || ""));
        if (!["https:", "http:"].includes(u.protocol)) throw new Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "请填写完整的 http 或 https 地址",
          path: ["meta", "url"],
        });
      }
    }
    if (
      v.kind === "expense" &&
      (!Number.isFinite(Number(v.meta.amount)) || Number(v.meta.amount) <= 0)
    )
      ctx.addIssue({ code: "custom", message: "金额需要大于零", path: ["meta", "amount"] });
    if (
      v.kind === "expense" &&
      (!["in", "out"].includes(String(v.meta.direction)) ||
        Number(v.meta.amount) > 999999999 ||
        Math.abs(Number(v.meta.amount) * 100 - Math.round(Number(v.meta.amount) * 100)) > 0.00001)
    )
      ctx.addIssue({
        code: "custom",
        message: "请填写有效收支方向和最多两位小数的金额",
        path: ["meta"],
      });
    if (["journal", "expense", "event"].includes(v.kind) && !v.dueAt)
      ctx.addIssue({ code: "custom", message: "请填写记录日期", path: ["dueAt"] });
    if (
      v.kind === "task" &&
      v.meta.stage &&
      !["todo", "doing", "done"].includes(String(v.meta.stage))
    )
      ctx.addIssue({ code: "custom", message: "待办阶段无效", path: ["meta", "stage"] });
    if (
      v.kind === "bookmark" &&
      v.meta.readState &&
      !["unread", "read"].includes(String(v.meta.readState))
    )
      ctx.addIssue({ code: "custom", message: "阅读状态无效", path: ["meta", "readState"] });
    if (
      v.kind === "task" &&
      v.meta.priority &&
      !["low", "normal", "high"].includes(String(v.meta.priority))
    )
      ctx.addIssue({ code: "custom", message: "优先级无效", path: ["meta", "priority"] });
    if (
      v.kind === "project" &&
      v.meta.progress !== undefined &&
      (!Number.isFinite(Number(v.meta.progress)) ||
        Number(v.meta.progress) < 0 ||
        Number(v.meta.progress) > 100)
    )
      ctx.addIssue({
        code: "custom",
        message: "进度需要在 0–100 之间",
        path: ["meta", "progress"],
      });
    if (v.kind === "event") {
      for (const key of ["time", "endTime"])
        if (v.meta[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v.meta[key])))
          ctx.addIssue({ code: "custom", message: "请填写有效时间", path: ["meta", key] });
      if (v.meta.endTime && (!v.meta.time || String(v.meta.endTime) <= String(v.meta.time)))
        ctx.addIssue({
          code: "custom",
          message: "结束时间需要晚于开始时间",
          path: ["meta", "endTime"],
        });
    }
    if (v.kind === "task" && v.meta.checklist) {
      try {
        const list = JSON.parse(String(v.meta.checklist));
        if (
          !Array.isArray(list) ||
          list.length > 50 ||
          list.some(
            (r) =>
              !r ||
              typeof r.id !== "string" ||
              r.id.length > 50 ||
              typeof r.text !== "string" ||
              !r.text.trim() ||
              r.text.length > 120 ||
              typeof r.done !== "boolean",
          ) ||
          new Set(list.map((r) => r.id)).size !== list.length
        )
          throw new Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "子清单最多 50 项，每项需要有效内容",
          path: ["meta", "checklist"],
        });
      }
    }
  });
export const preferencesInput = z.object({
  name: z.string().trim().min(1).max(30),
  motto: z.string().max(120),
  theme: z.enum(["light", "dark"]),
  weekStartsMonday: z.boolean(),
  trashRetentionDays: z.union([z.literal(0), z.literal(30), z.literal(90)]).default(0),
});
/** Remove owner IDs and decode the two JSON columns at the API boundary. */
export function fromRow(r: Record<string, unknown>): SpaceRecord {
  return {
    id: String(r.id),
    kind: r.kind as Kind,
    title: String(r.title),
    content: String(r.content),
    tags: JSON.parse(String(r.tags)),
    meta: JSON.parse(String(r.meta)),
    favorite: !!r.favorite,
    pinned: !!r.pinned,
    collectionId: (r.collection_id ?? r.collectionId ?? null) as string | null,
    status: r.status as SpaceRecord["status"],
    dueAt: (r.due_at ?? r.dueAt ?? null) as string | null,
    createdAt: String(r.created_at ?? r.createdAt),
    updatedAt: String(r.updated_at ?? r.updatedAt),
    deletedAt: (r.deleted_at ?? r.deletedAt ?? null) as string | null,
    version: Number(r.version),
  };
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function safeLink(value: unknown): string | undefined {
  try {
    const u = new URL(String(value));
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** API date hints use the same real-calendar validation as stored dates. */
export function isCalendarDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
