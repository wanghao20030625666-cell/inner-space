import { authorize, database, failure, json, ApiError } from "../../lib/server";
/** Stable owner-scoped keyset pages for activity and archival revision export. */
export async function GET(request: Request) {
  try {
    const owner = await authorize(request),
      p = new URL(request.url).searchParams,
      history = p.get("history") === "1",
      values: string[] = [owner],
      where = ["owner = ?"];
    if (p.get("q") && !history) {
      where.push("(instr(lower(title),lower(?)) > 0 OR instr(action,?) > 0)");
      values.push(p.get("q")!.slice(0, 200), p.get("q")!.slice(0, 200));
    }
    if (p.get("cursor")) {
      let after;
      try {
        after = JSON.parse(p.get("cursor")!);
      } catch {
        throw new ApiError(400, "分页参数无效");
      }
      if (
        !Array.isArray(after) ||
        after.length !== 2 ||
        after.some((x) => typeof x !== "string" || x.length > 80)
      )
        throw new ApiError(400, "分页参数无效");
      where.push("(created_at < ? OR (created_at = ? AND id < ?))");
      values.push(after[0], after[0], after[1]);
    }
    const columns = history
      ? "id, record_id AS recordId, snapshot, created_at AS createdAt"
      : "id, record_id AS recordId, action, title, created_at AS createdAt";
    const result = await database()
        .prepare(
          `SELECT ${columns} FROM ${history ? "revisions" : "audit"} WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT 201`,
        )
        .bind(...values)
        .all<Record<string, unknown>>(),
      rows = result.results.slice(0, 200),
      last = rows.at(-1);
    return json({
      rows,
      nextCursor:
        result.results.length > 200 && last ? JSON.stringify([last.createdAt, last.id]) : null,
    });
  } catch (e) {
    return failure(e);
  }
}
