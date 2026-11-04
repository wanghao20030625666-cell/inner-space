import { z } from "zod";
import { authorize, body, database, failure, json, ApiError } from "../../lib/server";
const input = z.object({ name: z.string().trim().min(1).max(40), color: z.enum(["green", "clay", "blue", "purple", "gray"]).default("green") });
export async function POST(request: Request) {
  try {
    const owner = await authorize(request), value = input.safeParse(await body(request));
    if (!value.success) throw new ApiError(400, "专题名称需要 1–40 个字");
    const count = await database().prepare("SELECT COUNT(*) AS n FROM collections WHERE owner = ?").bind(owner).first<{ n: number }>();
    if ((count?.n || 0) >= 100) throw new ApiError(400, "最多可创建 100 个专题");
    const item = { id: crypto.randomUUID(), ...value.data, createdAt: new Date().toISOString(), count: 0 };
    await database().prepare("INSERT INTO collections (id, owner, name, color, created_at) VALUES (?, ?, ?, ?, ?)").bind(item.id, owner, item.name, item.color, item.createdAt).run();
    return json({ collection: item }, 201);
  } catch (e) { return failure(e); }
}
export async function PATCH(request: Request) {
  try {
    const owner = await authorize(request), data = await body(request), value = input.safeParse(data);
    if (!data || typeof data.id !== "string" || !value.success) throw new ApiError(400, "专题参数无效");
    const result = await database().prepare("UPDATE collections SET name = ?, color = ? WHERE id = ? AND owner = ? RETURNING id").bind(value.data.name, value.data.color, data.id, owner).all();
    if (!result.results.length) throw new ApiError(404, "专题不存在");
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request) {
  try {
    const owner = await authorize(request), data = await body(request);
    if (!data || typeof data.id !== "string") throw new ApiError(400, "专题参数无效");
    // Detaching a collection preserves content; bump versions so old editors cannot reattach it.
    const db = database(), result = await db.batch([
      db.prepare("UPDATE records SET collection_id = NULL, version = version + 1 WHERE owner = ? AND collection_id = ?").bind(owner, data.id),
      db.prepare("DELETE FROM collections WHERE owner = ? AND id = ? RETURNING id").bind(owner, data.id),
    ]);
    if (!result[1].results.length) throw new ApiError(404, "专题不存在");
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
