import { authorize, database, failure, json, ownedRecord } from "../../lib/server";
export async function GET(request: Request) {
  try {
    const owner = await authorize(request),
      id = new URL(request.url).searchParams.get("id") || "";
    await ownedRecord(owner, id);
    const rows = await database()
      .prepare(
        "SELECT id, snapshot, created_at AS createdAt FROM revisions WHERE owner = ? AND record_id = ? ORDER BY created_at DESC LIMIT 30",
      )
      .bind(owner, id)
      .all<{ id: string; snapshot: string; createdAt: string }>();
    return json({
      versions: rows.results.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        item: JSON.parse(r.snapshot),
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
