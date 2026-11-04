import { authorize, database, failure, json } from "../../lib/server";
/** Counts indexed attachments, including trash, rather than claiming provider billing usage. */
export async function GET(request: Request) {
  try {
    const owner = await authorize(request),
      db = database();
    const [value, history] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS records,COALESCE(SUM(CASE WHEN kind IN ('file','photo') THEN CAST(json_extract(meta,'$.size') AS INTEGER) ELSE 0 END),0) AS fileBytes FROM records WHERE owner = ?",
        )
        .bind(owner)
        .first(),
      db.prepare("SELECT COUNT(*) AS revisions FROM revisions WHERE owner = ?").bind(owner).first(),
    ]);
    return json({ ...value, ...history, maxBytes: 1073741824, maxRecords: 10000 });
  } catch (e) {
    return failure(e);
  }
}
