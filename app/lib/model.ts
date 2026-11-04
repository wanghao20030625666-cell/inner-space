import { z } from "zod";
export const kinds = ["inbox", "note", "journal", "task", "project", "event", "bookmark", "file", "photo", "expense", "contact"] as const;
export type Kind = typeof kinds[number];
export type View = Kind | "overview" | "favorites" | "archive" | "trash" | "settings" | "activity";
export type SpaceRecord = { id: string; kind: Kind; title: string; content: string; tags: string[]; meta: Record<string, string | number>; favorite: boolean; status: "active" | "done" | "archived"; dueAt: string | null; createdAt: string; updatedAt: string; deletedAt: string | null; version: number };
export type Activity = { id: string; action: string; title: string; recordId: string | null; createdAt: string };
export type Preferences = { name: string; motto: string; theme: "light" | "dark"; weekStartsMonday: boolean };
export const defaultPreferences: Preferences = { name: "我的空间", motto: "把日常安放好，让想法慢慢生长。", theme: "light", weekStartsMonday: true };
export const recordInput = z.object({
  kind: z.enum(kinds), title: z.string().trim().min(1, "请填写标题").max(160), content: z.string().max(100000).default(""),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).default([]), meta: z.record(z.union([z.string().max(2000), z.number().finite()])).default({}),
  favorite: z.boolean().default(false), status: z.enum(["active", "done", "archived"]).default("active"),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请使用有效年月日").refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "日期无效").nullable().default(null),
}).superRefine((v, ctx) => {
  if (v.kind === "bookmark") {
    try { const u = new URL(String(v.meta.url || "")); if (!["https:", "http:"].includes(u.protocol)) throw new Error(); }
    catch { ctx.addIssue({ code: "custom", message: "请填写完整的 http 或 https 地址", path: ["meta", "url"] }); }
  }
  if (v.kind === "expense" && (!Number.isFinite(Number(v.meta.amount)) || Number(v.meta.amount) <= 0)) ctx.addIssue({ code: "custom", message: "金额需要大于零", path: ["meta", "amount"] });
  if (v.kind === "expense" && (!["in", "out"].includes(String(v.meta.direction)) || Number(v.meta.amount) > 999999999 || Math.abs(Number(v.meta.amount) * 100 - Math.round(Number(v.meta.amount) * 100)) > 0.00001)) ctx.addIssue({ code: "custom", message: "请填写有效收支方向和最多两位小数的金额", path: ["meta"] });
  if (["journal", "expense", "event"].includes(v.kind) && !v.dueAt) ctx.addIssue({ code: "custom", message: "请填写记录日期", path: ["dueAt"] });
});
export const preferencesInput = z.object({ name: z.string().trim().min(1).max(30), motto: z.string().max(120), theme: z.enum(["light", "dark"]), weekStartsMonday: z.boolean() });
/** Remove owner IDs and decode the two JSON columns at the API boundary. */
export function fromRow(r: Record<string, unknown>): SpaceRecord {
  return { id: String(r.id), kind: r.kind as Kind, title: String(r.title), content: String(r.content), tags: JSON.parse(String(r.tags)), meta: JSON.parse(String(r.meta)), favorite: !!r.favorite,
    status: r.status as SpaceRecord["status"], dueAt: (r.due_at ?? r.dueAt ?? null) as string | null, createdAt: String(r.created_at ?? r.createdAt), updatedAt: String(r.updated_at ?? r.updatedAt), deletedAt: (r.deleted_at ?? r.deletedAt ?? null) as string | null, version: Number(r.version) };
}
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function safeLink(value: unknown): string | undefined { try { const u = new URL(String(value)); return ["http:", "https:"].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } }
