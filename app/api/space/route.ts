import { authorize, body, createRecord, database, failure, json, ownedRecord, validateRecord, validateLinks, ApiError, cleanBlobs } from "../../lib/server";
import { defaultPreferences, fromRow, kinds } from "../../lib/model";

export async function GET(request: Request) {
  try {
    const owner = await authorize(request), db = database(), params = new URL(request.url).searchParams;
    const today = /^\d{4}-\d{2}-\d{2}$/.test(params.get("today") || "") ? params.get("today")! : new Date().toISOString().slice(0, 10);
    const q = (params.get("q") || "").slice(0, 200), kind = params.get("kind"), cursor = params.get("cursor");
    const conditions = ["owner = ?"], values: (string | number)[] = [owner], scope = params.get("scope") || "active";
    if (scope === "trash") conditions.push("deleted_at IS NOT NULL");
    else { conditions.push("deleted_at IS NULL"); if (scope === "archive") conditions.push("status = 'archived'"); else if (scope !== "all") conditions.push("status != 'archived'"); }
    if (scope === "favorites") conditions.push("favorite = 1");
    if (q) { conditions.push("(instr(lower(title), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0 OR instr(lower(tags), lower(?)) > 0)"); values.push(q, q, q); }
    if (kind && kinds.includes(kind as typeof kinds[number])) { conditions.push("kind = ?"); values.push(kind); }
    const tag = params.get("tag"), status = params.get("status"), collection = params.get("collection"), project = params.get("project"), month = params.get("month"), reading = params.get("reading");
    if (tag) { conditions.push("EXISTS (SELECT 1 FROM json_each(records.tags) WHERE value = ?)"); values.push(tag.slice(0, 24)); }
    if (status === "active" || status === "done") { conditions.push("status = ?"); values.push(status); }
    if (collection === "none") conditions.push("collection_id IS NULL");
    else if (collection) { conditions.push("collection_id = ?"); values.push(collection); }
    if (project) { conditions.push("json_extract(meta, '$.projectId') = ?"); values.push(project); }
    if (month && /^\d{4}-\d{2}$/.test(month)) { conditions.push("due_at LIKE ?"); values.push(`${month}%`); }
    if (reading === "read") conditions.push("json_extract(meta, '$.readState') = 'read'");
    if (reading === "unread") conditions.push("COALESCE(json_extract(meta, '$.readState'), 'unread') != 'read'");
    const totalConditions = conditions.join(" AND "), totalValues = [...values];
    if (cursor) {
      let after: unknown; try { after = JSON.parse(cursor); } catch { throw new ApiError(400, "分页参数无效"); }
      if (!Array.isArray(after) || after.length !== 3 || ![0, 1].includes(after[0]) || !after.slice(1).every(s => typeof s === "string" && s.length < 80)) throw new ApiError(400, "分页参数无效");
      conditions.push("(pinned < ? OR (pinned = ? AND (updated_at < ? OR (updated_at = ? AND id < ?))))"); values.push(after[0], after[0], after[1], after[1], after[2]);
    }
    const [rows, activities, prefs, counts, dueTasks, upcoming, collections, tags, pinned, total, stats, projectTasks, recent] = await Promise.all([
      db.prepare(`SELECT * FROM records WHERE ${conditions.join(" AND ")} ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT 201`).bind(...values).all<Record<string, unknown>>(),
      db.prepare("SELECT id, action, title, record_id AS recordId, created_at AS createdAt FROM audit WHERE owner = ? ORDER BY created_at DESC LIMIT 40").bind(owner).all(),
      db.prepare("SELECT value FROM settings WHERE owner = ?").bind(owner).first<{ value: string }>(),
      db.prepare("SELECT kind, status, favorite, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted, COUNT(*) AS count FROM records WHERE owner = ? GROUP BY kind, status, favorite, deleted").bind(owner).all(),
      db.prepare("SELECT * FROM records WHERE owner = ? AND kind = 'task' AND status = 'active' AND deleted_at IS NULL ORDER BY due_at IS NULL, due_at ASC, created_at DESC LIMIT 5").bind(owner).all<Record<string, unknown>>(),
      db.prepare("SELECT * FROM records WHERE owner = ? AND kind = 'event' AND status = 'active' AND deleted_at IS NULL AND due_at >= ? ORDER BY due_at ASC LIMIT 4").bind(owner, today).all<Record<string, unknown>>(),
      db.prepare("SELECT c.id, c.name, c.color, c.created_at AS createdAt, COUNT(r.id) AS count FROM collections c LEFT JOIN records r ON r.collection_id = c.id AND r.owner = c.owner AND r.deleted_at IS NULL AND r.status != 'archived' WHERE c.owner = ? GROUP BY c.id ORDER BY c.created_at ASC").bind(owner).all(),
      db.prepare("SELECT j.value AS name, COUNT(*) AS count FROM records r, json_each(r.tags) j WHERE r.owner = ? AND r.deleted_at IS NULL AND r.status != 'archived' GROUP BY j.value ORDER BY count DESC, name ASC LIMIT 100").bind(owner).all(),
      db.prepare("SELECT * FROM records WHERE owner = ? AND pinned = 1 AND deleted_at IS NULL AND status != 'archived' ORDER BY updated_at DESC, id DESC LIMIT 6").bind(owner).all<Record<string, unknown>>(),
      db.prepare(`SELECT COUNT(*) AS count FROM records WHERE ${totalConditions}`).bind(...totalValues).first<{ count: number }>(),
      db.prepare("SELECT COALESCE(SUM(CASE WHEN kind IN ('file','photo') THEN CAST(json_extract(meta,'$.size') AS INTEGER) ELSE 0 END),0) AS fileBytes, SUM(CASE WHEN kind = 'bookmark' AND COALESCE(json_extract(meta,'$.readState'),'unread') != 'read' THEN 1 ELSE 0 END) AS unread, SUM(CASE WHEN kind = 'task' AND status = 'active' AND due_at < ? THEN 1 ELSE 0 END) AS overdue FROM records WHERE owner = ? AND deleted_at IS NULL AND status != 'archived'").bind(today, owner).first(),
      db.prepare("SELECT json_extract(meta,'$.projectId') AS projectId, COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM records WHERE owner = ? AND kind = 'task' AND deleted_at IS NULL AND status != 'archived' AND json_extract(meta,'$.projectId') IS NOT NULL GROUP BY projectId").bind(owner).all(),
      // Recent edits must not be displaced by a large number of older pinned records.
      db.prepare("SELECT * FROM records WHERE owner = ? AND deleted_at IS NULL AND status != 'archived' ORDER BY updated_at DESC, id DESC LIMIT 7").bind(owner).all<Record<string, unknown>>(),
    ]);
    const items = rows.results.slice(0, 200).map(fromRow), last = items.at(-1);
    return json({ items, recent: recent.results.map(fromRow), dueTasks: dueTasks.results.map(fromRow), upcoming: upcoming.results.map(fromRow), pinned: pinned.results.map(fromRow), collections: collections.results, tags: tags.results, total: total?.count || 0, stats, projectTasks: projectTasks.results, activity: activities.results, preferences: prefs ? { ...defaultPreferences, ...JSON.parse(prefs.value) } : defaultPreferences, counts: counts.results, nextCursor: rows.results.length > 200 && last ? JSON.stringify([last.pinned ? 1 : 0, last.updatedAt, last.id]) : null });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const owner = await authorize(request), value = validateRecord(await body(request));
    if (["file", "photo"].includes(value.kind)) throw new ApiError(400, "文件和照片请使用上传入口");
    return json({ item: await createRecord(owner, value) }, 201);
  } catch (e) { return failure(e); }
}

/** A version check and transactional revision snapshot prevent lost updates. */
export async function PATCH(request: Request) {
  try {
    const owner = await authorize(request), data = await body(request);
    if (!data || typeof data.id !== "string" || !Number.isInteger(data.version)) throw new ApiError(400, "记录参数无效");
    const current = await ownedRecord(owner, data.id);
    if (data.version !== current.version) throw new ApiError(409, "这条记录已在其他窗口更新，请刷新后再编辑");
    const action = typeof data.action === "string" ? data.action : "edit";
    if (!["edit", "trash", "restore", "convert"].includes(action)) throw new ApiError(400, "操作无效");
    if (current.deletedAt && action !== "restore") throw new ApiError(400, "请先从回收站恢复记录");
    const targetKind = action === "convert" && current.kind === "inbox" && ["note", "task", "bookmark", "journal"].includes(data.kind) ? data.kind : current.kind;
    if (action === "convert" && targetKind === current.kind) throw new ApiError(400, "仅收集箱内容可以整理为笔记、日记、待办或收藏");
    const value = validateRecord({ ...current, ...data, kind: targetKind, meta: ["file", "photo"].includes(current.kind) ? current.meta : (data.meta ?? current.meta) });
    await validateLinks(owner, value, current);
    const now = new Date().toISOString(), nextVersion = current.version + 1, deletedAt = action === "trash" ? now : action === "restore" ? null : current.deletedAt;
    const title = action === "trash" ? "移入回收站" : action === "restore" ? "恢复" : action === "convert" ? "整理" : "更新", db = database();
    const results = await db.batch([
      db.prepare("INSERT INTO revisions (id, owner, record_id, snapshot, created_at) SELECT ?, ?, ?, ?, ? FROM records WHERE id = ? AND owner = ? AND version = ?").bind(crypto.randomUUID(), owner, current.id, JSON.stringify(current), now, current.id, owner, current.version),
      db.prepare("UPDATE records SET kind = ?, title = ?, content = ?, tags = ?, meta = ?, favorite = ?, pinned = ?, collection_id = ?, status = ?, due_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND owner = ? AND version = ? RETURNING *").bind(value.kind, value.title, value.content, JSON.stringify(value.tags), JSON.stringify(value.meta), value.favorite ? 1 : 0, value.pinned ? 1 : 0, value.collectionId, value.status, value.dueAt, deletedAt, now, nextVersion, current.id, owner, current.version),
      db.prepare("INSERT INTO audit (id, owner, action, title, record_id, created_at) SELECT ?, ?, ?, ?, ?, ? FROM records WHERE id = ? AND owner = ? AND version = ? AND updated_at = ?").bind(crypto.randomUUID(), owner, title, value.title, current.id, now, current.id, owner, nextVersion, now),
    ]);
    if (!results[1].results.length) throw new ApiError(409, "记录已更新，请刷新后重试");
    return json({ item: fromRow(results[1].results[0] as Record<string, unknown>) });
  } catch (e) { return failure(e); }
}

export async function DELETE(request: Request) {
  try {
    const owner = await authorize(request), data = await body(request);
    if (!data || typeof data.id !== "string") throw new ApiError(400, "记录参数无效");
    const item = await ownedRecord(owner, data.id);
    if (!item.deletedAt) throw new ApiError(400, "仅能彻底删除回收站中的记录");
    if (item.version !== data.version) throw new ApiError(409, "记录已更新，请刷新后重试");
    const db = database(), now = new Date().toISOString(), queries = [];
    // Store a retryable deletion key inside the same transaction as record removal.
    if (["file", "photo"].includes(item.kind) && item.meta.key === `${owner}/${item.id}`) queries.push(db.prepare("INSERT INTO blob_cleanup (id, owner, key, created_at) SELECT ?, ?, ?, ? FROM records WHERE id = ? AND owner = ? AND version = ? AND deleted_at IS NOT NULL").bind(crypto.randomUUID(), owner, item.meta.key, now, item.id, owner, item.version));
    queries.push(db.prepare("DELETE FROM revisions WHERE owner = ? AND record_id = ? AND EXISTS (SELECT 1 FROM records WHERE id = ? AND owner = ? AND version = ? AND deleted_at IS NOT NULL)").bind(owner, item.id, item.id, owner, item.version));
    const deleteIndex = queries.length;
    queries.push(db.prepare("DELETE FROM records WHERE owner = ? AND id = ? AND version = ? AND deleted_at IS NOT NULL RETURNING id").bind(owner, item.id, item.version));
    queries.push(db.prepare("INSERT INTO audit (id, owner, action, title, record_id, created_at) SELECT ?, ?, '彻底删除', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM records WHERE owner = ? AND id = ?)").bind(crypto.randomUUID(), owner, item.title, item.id, now, owner, item.id));
    const result = await db.batch(queries);
    if (!result[deleteIndex].results.length) throw new ApiError(409, "记录已变化，请刷新后重试");
    return json({ ok: true, cleanupPending: await cleanBlobs(owner) });
  } catch (e) { return failure(e); }
}
