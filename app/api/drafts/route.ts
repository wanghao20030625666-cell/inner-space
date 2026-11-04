import { z } from "zod";
import { authorize, body, database, failure, json, ownedRecord, ApiError } from "../../lib/server";
import { kinds } from "../../lib/model";
const input = z.object({
  key: z
    .string()
    .regex(
      /^(new-(inbox|note|journal|task|project|event|bookmark|expense|contact)|[0-9a-f-]{36})$/,
    ),
  version: z.number().int().min(0),
  data: z.object({
    baseVersion: z.number().int().min(0).optional(),
    kind: z.enum(kinds),
    title: z.string().max(160),
    content: z.string().max(100000),
    tags: z.string().max(400),
    dueAt: z.string().max(10),
    status: z.enum(["active", "done", "archived"]),
    meta: z.record(z.union([z.string().max(20000), z.number().finite()])),
    favorite: z.boolean(),
    pinned: z.boolean(),
    collectionId: z.string().uuid().nullable(),
  }),
});

/** Versioned, owner-scoped drafts never change a record or its revision history. */
export async function GET(request: Request) {
  try {
    const owner = await authorize(request),
      key = new URL(request.url).searchParams.get("key"),
      db = database();
    if (key) {
      const r = await db
        .prepare(
          "SELECT key, data, version, updated_at AS updatedAt FROM drafts WHERE owner = ? AND key = ?",
        )
        .bind(owner, key)
        .first<{ key: string; data: string; version: number; updatedAt: string }>();
      return json({ draft: r ? { ...r, data: JSON.parse(r.data) } : null });
    }
    const r = await db
      .prepare(
        "SELECT key, json_extract(data, '$.title') AS title, json_extract(data, '$.kind') AS kind, version, updated_at AS updatedAt FROM drafts WHERE owner = ? ORDER BY updated_at DESC LIMIT 50",
      )
      .bind(owner)
      .all();
    return json({ drafts: r.results });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const owner = await authorize(request),
      parsed = input.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "草稿格式无效");
    const { key, version, data } = parsed.data,
      db = database(),
      now = new Date().toISOString();
    if (!key.startsWith("new-")) {
      const item = await ownedRecord(owner, key);
      if (item.deletedAt) throw new ApiError(400, "请先恢复记录再编辑");
    }
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM drafts WHERE owner = ?")
      .bind(owner)
      .first<{ n: number }>();
    if (!version && (count?.n || 0) >= 50)
      throw new ApiError(400, "草稿已达 50 份，请先整理已有草稿");
    const result = version
      ? await db
          .prepare(
            "UPDATE drafts SET data = ?, version = version + 1, updated_at = ? WHERE owner = ? AND key = ? AND version = ? RETURNING version",
          )
          .bind(JSON.stringify(data), now, owner, key, version)
          .all<{ version: number }>()
      : await db
          .prepare(
            "INSERT INTO drafts (id, owner, key, data, version, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING version",
          )
          .bind(`${owner}:${key}`, owner, key, JSON.stringify(data), now)
          .all<{ version: number }>();
    if (!result.results.length)
      throw new ApiError(409, "草稿已在其他窗口更新，请复制当前文字后重新打开");
    return json({ version: result.results[0].version, updatedAt: now });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const owner = await authorize(request),
      value = await body(request);
    if (!value || typeof value.key !== "string" || !Number.isInteger(value.version))
      throw new ApiError(400, "草稿参数无效");
    const result = await database()
      .prepare("DELETE FROM drafts WHERE owner = ? AND key = ? AND version = ? RETURNING id")
      .bind(owner, value.key, value.version)
      .all();
    if (!result.results.length) throw new ApiError(409, "草稿已变化，请刷新后重试");
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
