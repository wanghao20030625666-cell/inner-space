import { authorize, body, database, failure, json, ApiError, retention } from "../../lib/server";
import { fromRow } from "../../lib/model";
export async function GET(request: Request) {
  try {
    const owner = await authorize(request);
    const r = await database()
      .prepare(
        "SELECT j.value AS name, COUNT(*) AS count FROM records r, json_each(r.tags) j WHERE r.owner = ? GROUP BY j.value ORDER BY count DESC,name ASC",
      )
      .bind(owner)
      .all();
    return json({ tags: r.results });
  } catch (e) {
    return failure(e);
  }
}
/** Rename/merge/remove in bounded batches, preserving snapshots and edit conflicts. */
export async function PATCH(request: Request) {
  try {
    const owner = await authorize(request),
      input = await body(request),
      from = typeof input?.from === "string" ? input.from.trim() : "",
      to = typeof input?.to === "string" ? input.to.trim() : "";
    if (!from || from.length > 24 || to.length > 24 || from === to)
      throw new ApiError(400, "请填写有效且不同的标签");
    const db = database(),
      rows = await db
        .prepare(
          "SELECT * FROM records WHERE owner = ? AND EXISTS (SELECT 1 FROM json_each(records.tags) WHERE value = ?) LIMIT 50",
        )
        .bind(owner, from)
        .all<Record<string, unknown>>(),
      now = new Date().toISOString(),
      statements = [];
    for (const row of rows.results) {
      const r = fromRow(row),
        tags = [...new Set(r.tags.flatMap((t) => (t === from ? (to ? [to] : []) : [t])))];
      statements.push(
        db
          .prepare(
            "INSERT INTO revisions (id,owner,record_id,snapshot,created_at) SELECT ?,?,?,?,? FROM records WHERE id = ? AND owner = ? AND version = ?",
          )
          .bind(crypto.randomUUID(), owner, r.id, JSON.stringify(r), now, r.id, owner, r.version),
      );
      statements.push(
        db
          .prepare(
            "UPDATE records SET tags = ?, version = version + 1, updated_at = ? WHERE owner = ? AND id = ? AND version = ? RETURNING id",
          )
          .bind(JSON.stringify(tags), now, owner, r.id, r.version),
      );
      statements.push(...retention(db, owner, r.id).slice(1));
    }
    const results = statements.length ? await db.batch(statements) : [],
      changed = results.filter((_, i) => i % 3 === 1).reduce((n, r) => n + r.results.length, 0);
    if (changed)
      await db
        .prepare("INSERT INTO audit (id,owner,action,title,created_at) VALUES (?,?,'整理标签',?,?)")
        .bind(crypto.randomUUID(), owner, to ? `${from} → ${to}` : `移除 ${from}`, now)
        .run();
    if (changed) await db.batch(retention(db, owner));
    const remaining = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM records WHERE owner = ? AND EXISTS (SELECT 1 FROM json_each(records.tags) WHERE value = ?)",
      )
      .bind(owner, from)
      .first<{ n: number }>();
    return json({ changed, remaining: remaining?.n || 0 });
  } catch (e) {
    return failure(e);
  }
}
