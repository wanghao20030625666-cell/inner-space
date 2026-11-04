import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { fromRow, recordInput, type SpaceRecord } from "./model";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database() { if (!env.DB) throw new ApiError(503, "数据服务暂不可用"); return env.DB; }
export function bucket() { if (!env.BUCKET) throw new ApiError(503, "文件服务暂不可用"); return env.BUCKET; }
/** Check identity and origin for every operation, including uploads and downloads. */
export async function authorize(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "请先登录后再访问私人空间");
  const origin = request.headers.get("origin");
  if (!["GET", "HEAD"].includes(request.method) && origin && origin !== new URL(request.url).origin) throw new ApiError(403, "请求来源无效");
  return user.userId;
}
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("Space operation failed", error instanceof Error ? error.name : "unknown");
  return json({ error: "操作未完成，请稍后重试" }, 500);
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1200000) throw new ApiError(413, "内容超过大小限制");
  const text = await request.text(); if (text.length > 1100000) throw new ApiError(413, "内容超过大小限制");
  try { return JSON.parse(text); } catch { throw new ApiError(400, "数据格式无效"); }
}
export function validateRecord(data: unknown) { const result = recordInput.safeParse(data); if (!result.success) throw new ApiError(400, result.error.issues[0].message); return result.data; }
export async function ownedRecord(owner: string, id: string) {
  const row = await database().prepare("SELECT * FROM records WHERE owner = ? AND id = ?").bind(owner, id).first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "记录不存在或无权访问"); return fromRow(row);
}
/** A content record and its activity entry commit in the same transaction. */
export async function createRecord(owner: string, value: ReturnType<typeof validateRecord>, id = crypto.randomUUID()) {
  const now = new Date().toISOString(), item: SpaceRecord = { ...value, id, createdAt: now, updatedAt: now, deletedAt: null, version: 1 }, db = database();
  await db.batch([
    db.prepare("INSERT INTO records (id, owner, kind, title, content, tags, meta, favorite, status, due_at, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)").bind(id, owner, item.kind, item.title, item.content, JSON.stringify(item.tags), JSON.stringify(item.meta), item.favorite ? 1 : 0, item.status, item.dueAt, now, now),
    db.prepare("INSERT INTO audit (id, owner, action, title, record_id, created_at) VALUES (?, ?, '创建', ?, ?, ?)").bind(crypto.randomUUID(), owner, item.title, id, now),
  ]); return item;
}
/** Retryable outbox keeps permanent file deletion recoverable across service failures. */
export async function cleanBlobs(owner: string) {
  const db = database(), rows = await db.prepare("SELECT id, key FROM blob_cleanup WHERE owner = ? LIMIT 50").bind(owner).all<{ id: string; key: string }>();
  for (const row of rows.results) { try { await bucket().delete(row.key); await db.prepare("DELETE FROM blob_cleanup WHERE id = ? AND owner = ?").bind(row.id, owner).run(); } catch { /* The durable key remains available for a later retry. */ } }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM blob_cleanup WHERE owner = ?").bind(owner).first<{ count: number }>(); return count?.count || 0;
}
