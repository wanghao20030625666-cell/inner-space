import {
  authorize,
  body,
  database,
  failure,
  json,
  ApiError,
  permanentDeleteStatements,
  retention,
  cleanBlobs,
} from "../../lib/server";
import { fromRow } from "../../lib/model";
import { trashBatchInput, type TrashResult } from "../../lib/trash";
/** Read-only review snapshot: never deletes and never includes other owners' IDs. */
export async function GET(request: Request) {
  try {
    const owner = await authorize(request);
    const rows = await database()
      .prepare(
        "SELECT id,version FROM records WHERE owner = ? AND deleted_at IS NOT NULL ORDER BY deleted_at,id LIMIT 10000",
      )
      .bind(owner)
      .all();
    return json({ items: rows.results });
  } catch (e) {
    return failure(e);
  }
}
/** Each reviewed version is checked again inside the existing deletion transaction. */
export async function POST(request: Request) {
  try {
    const owner = await authorize(request),
      parsed = trashBatchInput.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "每批需要 1–10 条不重复的记录及有效版本号");
    const db = database(),
      refs = parsed.data.items;
    const rows = await db
      .prepare(`SELECT * FROM records WHERE owner = ? AND id IN (${refs.map(() => "?").join(",")})`)
      .bind(owner, ...refs.map((r) => r.id))
      .all<Record<string, unknown>>();
    const items = new Map(
      rows.results.map((r) => {
        const item = fromRow(r);
        return [item.id, item] as const;
      }),
    );
    const results: TrashResult[] = [],
      statements = [],
      checks: { index: number; result: TrashResult }[] = [];
    for (const ref of refs) {
      const item = items.get(ref.id);
      const result: TrashResult = { id: ref.id, status: !item ? "unavailable" : "changed" };
      results.push(result);
      if (!item?.deletedAt || item.version !== ref.version) continue;
      const part = permanentDeleteStatements(db, owner, item);
      checks.push({ index: statements.length + part.length - 1, result });
      statements.push(...part);
    }
    if (statements.length) {
      const changes = await db.batch([...statements, ...retention(db, owner)]);
      for (const check of checks)
        if (changes[check.index].results.length) check.result.status = "deleted";
    }
    return json({ results, cleanupPending: await cleanBlobs(owner) });
  } catch (e) {
    return failure(e);
  }
}
