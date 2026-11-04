import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { fromRow, recordInput, type SpaceRecord } from "./model";
import { ApiError } from "./errors";
import { normalizePreferences, trashCutoff } from "./preferences";
export { ApiError } from "./errors";
export function database() {
  if (!env.DB) throw new ApiError(503, "数据服务暂不可用");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new ApiError(503, "文件服务暂不可用");
  return env.BUCKET;
}
/** Check identity and origin for every operation, including uploads and downloads. */
export async function authorize(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "请先登录后再访问私人空间");
  const origin = request.headers.get("origin");
  if (!["GET", "HEAD"].includes(request.method) && origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "请求来源无效");
  return user.userId;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error(
    "Space operation failed",
    error instanceof Error ? error.stack || error.name : "unknown",
  );
  return json({ error: "操作未完成，请稍后重试" }, 500);
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 1200000)
    throw new ApiError(413, "内容超过大小限制");
  const text = await request.text();
  if (text.length > 1100000) throw new ApiError(413, "内容超过大小限制");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "数据格式无效");
  }
}
export function validateRecord(data: unknown) {
  const result = recordInput.safeParse(data);
  if (!result.success) throw new ApiError(400, result.error.issues[0].message);
  return result.data;
}
/** Relation IDs are authorized independently; a valid UUID does not imply ownership. */
export async function validateLinks(
  owner: string,
  value: ReturnType<typeof validateRecord>,
  previous?: SpaceRecord,
) {
  if (value.meta.parentId && value.meta.parentId !== previous?.meta.parentId) {
    if (!["file", "photo"].includes(value.kind)) throw new ApiError(400, "只有附件可以关联内容");
    const parent = await database()
      .prepare(
        "SELECT id FROM records WHERE id = ? AND owner = ? AND deleted_at IS NULL AND kind NOT IN ('file','photo')",
      )
      .bind(String(value.meta.parentId), owner)
      .first();
    if (!parent) throw new ApiError(400, "关联内容不存在或已被删除");
  }
  if (
    value.collectionId &&
    !(await database()
      .prepare("SELECT id FROM collections WHERE id = ? AND owner = ?")
      .bind(value.collectionId, owner)
      .first())
  )
    throw new ApiError(400, "专题不存在，请重新选择");
  if (
    value.kind === "task" &&
    value.meta.projectId &&
    (previous?.kind !== "task" || previous.meta.projectId !== value.meta.projectId) &&
    !(await database()
      .prepare(
        "SELECT id FROM records WHERE id = ? AND owner = ? AND kind = 'project' AND deleted_at IS NULL",
      )
      .bind(String(value.meta.projectId), owner)
      .first())
  )
    throw new ApiError(400, "关联项目不存在或已被删除");
}
export async function ownedRecord(owner: string, id: string) {
  const row = await database()
    .prepare("SELECT * FROM records WHERE owner = ? AND id = ?")
    .bind(owner, id)
    .first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "记录不存在或无权访问");
  return fromRow(row);
}
/** A content record and its activity entry commit in the same transaction. */
export async function createRecord(
  owner: string,
  value: ReturnType<typeof validateRecord>,
  id = crypto.randomUUID(),
) {
  await validateLinks(owner, value);
  const now = new Date().toISOString(),
    item: SpaceRecord = {
      ...value,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    },
    db = database();
  const result = await db.batch([
    db
      .prepare(
        "INSERT INTO records (id, owner, kind, title, content, tags, meta, favorite, pinned, collection_id, status, due_at, created_at, updated_at, version) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE (SELECT COUNT(*) FROM records WHERE owner = ?) < 10000 AND (SELECT COALESCE(SUM(CAST(json_extract(meta,'$.size') AS INTEGER)),0) FROM records WHERE owner = ? AND kind IN ('file','photo')) + ? <= 1073741824 RETURNING id",
      )
      .bind(
        id,
        owner,
        item.kind,
        item.title,
        item.content,
        JSON.stringify(item.tags),
        JSON.stringify(item.meta),
        item.favorite ? 1 : 0,
        item.pinned ? 1 : 0,
        item.collectionId,
        item.status,
        item.dueAt,
        now,
        now,
        owner,
        owner,
        ["file", "photo"].includes(item.kind) ? Number(item.meta.size || 0) : 0,
      ),
    db
      .prepare(
        "INSERT INTO audit (id, owner, action, title, record_id, created_at) SELECT ?, ?, '创建', ?, ?, ? WHERE EXISTS (SELECT 1 FROM records WHERE id = ? AND owner = ?)",
      )
      .bind(crypto.randomUUID(), owner, item.title, id, now, id, owner),
    ...retention(db, owner),
  ]);
  if (!result[0].results.length)
    throw new ApiError(409, "空间达到 10,000 条内容或 1 GB 附件上限，请备份后整理回收站");
  await purgeExpiredTrash(owner);
  return item;
}
/** Manual and opt-in expiry deletion share a version-guarded transaction and blob outbox. */
export function permanentDeleteStatements(
  db: ReturnType<typeof database>,
  owner: string,
  item: SpaceRecord,
  expiry?: { cutoff: string; settingsValue: string },
) {
  const now = new Date().toISOString();
  const guard =
    "id = ? AND owner = ? AND version = ? AND deleted_at IS NOT NULL" +
    (expiry
      ? " AND deleted_at < ? AND EXISTS (SELECT 1 FROM settings WHERE owner = ? AND value = ?)"
      : "");
  const values = [
    item.id,
    owner,
    item.version,
    ...(expiry ? [expiry.cutoff, owner, expiry.settingsValue] : []),
  ];
  const statements = [];
  if (["file", "photo"].includes(item.kind) && item.meta.key === `${owner}/${item.id}`)
    statements.push(
      db
        .prepare(
          `INSERT INTO blob_cleanup (id, owner, key, created_at) SELECT ?, ?, ?, ? FROM records WHERE ${guard}`,
        )
        .bind(crypto.randomUUID(), owner, item.meta.key, now, ...values),
    );
  statements.push(
    db
      .prepare(
        `DELETE FROM revisions WHERE owner = ? AND record_id = ? AND EXISTS (SELECT 1 FROM records WHERE ${guard})`,
      )
      .bind(owner, item.id, ...values),
    db
      .prepare(
        `DELETE FROM drafts WHERE owner = ? AND key = ? AND EXISTS (SELECT 1 FROM records WHERE ${guard})`,
      )
      .bind(owner, item.id, ...values),
    db
      .prepare(
        `INSERT INTO audit (id, owner, action, title, record_id, created_at) SELECT ?, ?, ?, ?, ?, ? FROM records WHERE ${guard}`,
      )
      .bind(
        crypto.randomUUID(),
        owner,
        expiry ? "到期清理" : "彻底删除",
        item.title,
        item.id,
        now,
        ...values,
      ),
    db.prepare(`DELETE FROM records WHERE ${guard} RETURNING id`).bind(...values),
  );
  return statements;
}
/** Bounded lazy cleanup never runs on reads or before a restore; settings are rechecked atomically. */
export async function purgeExpiredTrash(owner: string) {
  try {
    const db = database(),
      settings = await db
        .prepare("SELECT value FROM settings WHERE owner = ?")
        .bind(owner)
        .first<{ value: string }>();
    const cutoff = trashCutoff(
      normalizePreferences(settings ? JSON.parse(settings.value) : null).trashRetentionDays,
    );
    if (!cutoff || !settings) return { deleted: 0, pending: 0 };
    const rows = await db
      .prepare(
        "SELECT * FROM records WHERE owner = ? AND deleted_at IS NOT NULL AND deleted_at < ? ORDER BY deleted_at,id LIMIT 20",
      )
      .bind(owner, cutoff)
      .all<Record<string, unknown>>();
    if (!rows.results.length) return { deleted: 0, pending: 0 };
    const statements = [],
      indices = [];
    for (const row of rows.results) {
      const part = permanentDeleteStatements(db, owner, fromRow(row), {
        cutoff,
        settingsValue: settings.value,
      });
      indices.push(statements.length + part.length - 1);
      statements.push(...part);
    }
    const results = await db.batch([...statements, ...retention(db, owner)]);
    return {
      deleted: indices.reduce((sum, index) => sum + results[index].results.length, 0),
      pending: await cleanBlobs(owner),
    };
  } catch (e) {
    // A successful foreground save stays successful; cleanup remains retryable on the next write.
    console.error("Trash expiry cleanup failed", e instanceof Error ? e.stack : "unknown");
    return { deleted: 0, pending: 0 };
  }
}
/** Retryable outbox keeps permanent file deletion recoverable across service failures. */
export async function cleanBlobs(owner: string) {
  const db = database(),
    rows = await db
      .prepare("SELECT id, key FROM blob_cleanup WHERE owner = ? LIMIT 50")
      .bind(owner)
      .all<{ id: string; key: string }>();
  for (const row of rows.results) {
    try {
      await bucket().delete(row.key);
      await db
        .prepare("DELETE FROM blob_cleanup WHERE id = ? AND owner = ?")
        .bind(row.id, owner)
        .run();
    } catch {
      /* The durable key remains available for a later retry. */
    }
  }
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM blob_cleanup WHERE owner = ?")
    .bind(owner)
    .first<{ count: number }>();
  return count?.count || 0;
}

/** Bounded retention runs with normal writes, without a separate scheduled job. */
export function retention(db: ReturnType<typeof database>, owner: string, recordId?: string) {
  const statements = [
    db
      .prepare(
        "DELETE FROM audit WHERE owner = ? AND id NOT IN (SELECT id FROM audit WHERE owner = ? ORDER BY created_at DESC,id DESC LIMIT 10000)",
      )
      .bind(owner, owner),
  ];
  if (recordId)
    statements.push(
      db
        .prepare(
          "DELETE FROM revisions WHERE owner = ? AND record_id = ? AND id NOT IN (SELECT id FROM revisions WHERE owner = ? AND record_id = ? ORDER BY created_at DESC,id DESC LIMIT 100)",
        )
        .bind(owner, recordId, owner, recordId),
    );
  return statements;
}
