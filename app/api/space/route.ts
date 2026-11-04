import {
  authorize,
  body,
  createRecord,
  database,
  failure,
  json,
  ownedRecord,
  validateRecord,
  validateLinks,
  ApiError,
  cleanBlobs,
  retention,
  permanentDeleteStatements,
  purgeExpiredTrash,
} from "../../lib/server";
import { recordQuery } from "../../lib/query";
import { defaultPreferences, fromRow, isCalendarDate } from "../../lib/model";

export async function GET(request: Request) {
  try {
    const owner = await authorize(request),
      db = database(),
      params = new URL(request.url).searchParams;
    const today = isCalendarDate(params.get("today") || "")
      ? params.get("today")!
      : new Date().toISOString().slice(0, 10);
    const query = recordQuery(owner, params),
      { totalWhere, totalValues } = query;
    // General lite lists use two queries; project task lists add one scoped aggregate.
    if (params.get("lite") === "1") {
      const [rows, total, projectTasks] = await Promise.all([
        db
          .prepare(
            `SELECT *, ${query.sortSql} AS _sort FROM records WHERE ${query.where} ORDER BY ${query.order} LIMIT 201`,
          )
          .bind(...query.values)
          .all<Record<string, unknown>>(),
        db
          .prepare(`SELECT COUNT(*) AS count FROM records WHERE ${totalWhere}`)
          .bind(...totalValues)
          .first<{ count: number }>(),
        params.get("project")
          ? db
              .prepare(
                "SELECT json_extract(meta,'$.projectId') AS projectId, COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM records WHERE owner = ? AND kind = 'task' AND deleted_at IS NULL AND status != 'archived' AND json_extract(meta,'$.projectId') = ? GROUP BY projectId",
              )
              .bind(owner, params.get("project"))
              .all()
          : Promise.resolve({ results: [] }),
      ]);
      const items = rows.results.slice(0, 200).map(fromRow),
        last = items.at(-1);
      return json({
        items,
        total: total?.count || 0,
        projectTasks: projectTasks.results,
        nextCursor:
          rows.results.length > 200 && last
            ? JSON.stringify([last.pinned ? 1 : 0, String(rows.results[199]._sort), last.id])
            : null,
      });
    }
    const [
      rows,
      activities,
      prefs,
      counts,
      dueTasks,
      upcoming,
      collections,
      tags,
      pinned,
      total,
      stats,
      projectTasks,
      recent,
      ledgerTotals,
      ledgerCategories,
      ledgerMonths,
      onThisDay,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT *, ${query.sortSql} AS _sort FROM records WHERE ${query.where} ORDER BY ${query.order} LIMIT 201`,
        )
        .bind(...query.values)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT id, action, title, record_id AS recordId, created_at AS createdAt FROM audit WHERE owner = ? ORDER BY created_at DESC LIMIT 40",
        )
        .bind(owner)
        .all(),
      db
        .prepare("SELECT value FROM settings WHERE owner = ?")
        .bind(owner)
        .first<{ value: string }>(),
      db
        .prepare(
          "SELECT kind, status, favorite, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted, COUNT(*) AS count FROM records WHERE owner = ? GROUP BY kind, status, favorite, deleted",
        )
        .bind(owner)
        .all(),
      db
        .prepare(
          "SELECT * FROM records WHERE owner = ? AND kind = 'task' AND status = 'active' AND deleted_at IS NULL ORDER BY due_at IS NULL, due_at ASC, created_at DESC LIMIT 5",
        )
        .bind(owner)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT * FROM records WHERE owner = ? AND kind = 'event' AND status = 'active' AND deleted_at IS NULL AND due_at >= ? ORDER BY due_at ASC LIMIT 4",
        )
        .bind(owner, today)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          "SELECT c.id, c.name, c.color, c.created_at AS createdAt, COUNT(r.id) AS count FROM collections c LEFT JOIN records r ON r.collection_id = c.id AND r.owner = c.owner AND r.deleted_at IS NULL AND r.status != 'archived' WHERE c.owner = ? GROUP BY c.id ORDER BY c.created_at ASC",
        )
        .bind(owner)
        .all(),
      db
        .prepare(
          "SELECT j.value AS name, COUNT(*) AS count FROM records r, json_each(r.tags) j WHERE r.owner = ? AND r.deleted_at IS NULL AND r.status != 'archived' GROUP BY j.value ORDER BY count DESC, name ASC LIMIT 100",
        )
        .bind(owner)
        .all(),
      db
        .prepare(
          "SELECT * FROM records WHERE owner = ? AND pinned = 1 AND deleted_at IS NULL AND status != 'archived' ORDER BY updated_at DESC, id DESC LIMIT 6",
        )
        .bind(owner)
        .all<Record<string, unknown>>(),
      db
        .prepare(`SELECT COUNT(*) AS count FROM records WHERE ${totalWhere}`)
        .bind(...totalValues)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN kind IN ('file','photo') THEN CAST(json_extract(meta,'$.size') AS INTEGER) ELSE 0 END),0) AS fileBytes, SUM(CASE WHEN kind = 'bookmark' AND COALESCE(json_extract(meta,'$.readState'),'unread') != 'read' THEN 1 ELSE 0 END) AS unread, SUM(CASE WHEN kind = 'task' AND status = 'active' AND due_at < ? THEN 1 ELSE 0 END) AS overdue FROM records WHERE owner = ? AND deleted_at IS NULL AND status != 'archived'",
        )
        .bind(today, owner)
        .first(),
      db
        .prepare(
          "SELECT json_extract(meta,'$.projectId') AS projectId, COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM records WHERE owner = ? AND kind = 'task' AND deleted_at IS NULL AND status != 'archived' AND json_extract(meta,'$.projectId') IS NOT NULL GROUP BY projectId",
        )
        .bind(owner)
        .all(),
      // Recent edits must not be displaced by a large number of older pinned records.
      db
        .prepare(
          "SELECT * FROM records WHERE owner = ? AND deleted_at IS NULL AND status != 'archived' ORDER BY updated_at DESC, id DESC LIMIT 7",
        )
        .bind(owner)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN json_extract(meta,'$.direction') = 'in' THEN ROUND(CAST(json_extract(meta,'$.amount') AS REAL) * 100) ELSE 0 END),0) AS incomeCents, COALESCE(SUM(CASE WHEN json_extract(meta,'$.direction') = 'out' THEN ROUND(CAST(json_extract(meta,'$.amount') AS REAL) * 100) ELSE 0 END),0) AS expenseCents FROM records WHERE ${totalWhere} AND kind = 'expense'`,
        )
        .bind(...totalValues)
        .first(),
      db
        .prepare(
          `SELECT COALESCE(NULLIF(json_extract(meta,'$.category'),''),'未分类') AS name, SUM(ROUND(CAST(json_extract(meta,'$.amount') AS REAL) * 100)) AS cents FROM records WHERE ${totalWhere} AND kind = 'expense' AND json_extract(meta,'$.direction') = 'out' GROUP BY name ORDER BY cents DESC`,
        )
        .bind(...totalValues)
        .all(),
      db
        .prepare(
          `SELECT substr(due_at,1,7) AS month, SUM(CASE WHEN json_extract(meta,'$.direction') = 'in' THEN ROUND(CAST(json_extract(meta,'$.amount') AS REAL)*100) ELSE 0 END) AS incomeCents, SUM(CASE WHEN json_extract(meta,'$.direction') = 'out' THEN ROUND(CAST(json_extract(meta,'$.amount') AS REAL)*100) ELSE 0 END) AS expenseCents FROM records WHERE ${totalWhere} AND kind = 'expense' GROUP BY month ORDER BY month DESC LIMIT 12`,
        )
        .bind(...totalValues)
        .all(),
      db
        .prepare(
          "SELECT * FROM records WHERE owner = ? AND kind = 'journal' AND deleted_at IS NULL AND status != 'archived' AND substr(due_at,6,5) = ? AND substr(due_at,1,4) < ? ORDER BY due_at DESC,updated_at DESC,id DESC LIMIT 5",
        )
        .bind(owner, today.slice(5), today.slice(0, 4))
        .all<Record<string, unknown>>(),
    ]);
    const items = rows.results.slice(0, 200).map(fromRow),
      last = items.at(-1);
    return json({
      ledger: {
        ...ledgerTotals,
        categories: ledgerCategories.results,
        months: ledgerMonths.results,
      },
      items,
      onThisDay: onThisDay.results.map(fromRow),
      recent: recent.results.map(fromRow),
      dueTasks: dueTasks.results.map(fromRow),
      upcoming: upcoming.results.map(fromRow),
      pinned: pinned.results.map(fromRow),
      collections: collections.results,
      tags: tags.results,
      total: total?.count || 0,
      stats,
      projectTasks: projectTasks.results,
      activity: activities.results,
      preferences: prefs
        ? { ...defaultPreferences, ...JSON.parse(prefs.value) }
        : defaultPreferences,
      counts: counts.results,
      nextCursor:
        rows.results.length > 200 && last
          ? JSON.stringify([last.pinned ? 1 : 0, String(rows.results[199]._sort), last.id])
          : null,
    });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await authorize(request),
      value = validateRecord(await body(request));
    if (["file", "photo"].includes(value.kind)) throw new ApiError(400, "文件和照片请使用上传入口");
    return json({ item: await createRecord(owner, value) }, 201);
  } catch (e) {
    return failure(e);
  }
}

/** A version check and transactional revision snapshot prevent lost updates. */
export async function PATCH(request: Request) {
  try {
    const owner = await authorize(request),
      data = await body(request);
    if (!data || typeof data.id !== "string" || !Number.isInteger(data.version))
      throw new ApiError(400, "记录参数无效");
    const current = await ownedRecord(owner, data.id);
    if (data.version !== current.version)
      throw new ApiError(409, "这条记录已在其他窗口更新，请刷新后再编辑");
    const action = typeof data.action === "string" ? data.action : "edit";
    if (!["edit", "trash", "restore", "convert", "archive", "unarchive"].includes(action))
      throw new ApiError(400, "操作无效");
    if (current.deletedAt && action !== "restore") throw new ApiError(400, "请先从回收站恢复记录");
    const targetKind =
      action === "convert" &&
      current.kind === "inbox" &&
      ["note", "task", "bookmark", "journal"].includes(data.kind)
        ? data.kind
        : current.kind;
    if (action === "convert" && targetKind === current.kind)
      throw new ApiError(400, "仅收集箱内容可以整理为笔记、日记、待办或收藏");
    const meta = ["file", "photo"].includes(current.kind)
      ? {
          ...current.meta,
          ...(data.meta?.parentId !== undefined ? { parentId: data.meta.parentId } : {}),
        }
      : { ...(data.meta ?? current.meta) };
    if (action === "archive")
      meta.previousStatus =
        current.status === "archived" ? meta.previousStatus || "active" : current.status;
    const status =
      action === "archive"
        ? "archived"
        : action === "unarchive"
          ? current.meta.previousStatus === "done"
            ? "done"
            : "active"
          : (data.status ?? current.status);
    const value = validateRecord({ ...current, ...data, status, kind: targetKind, meta });
    await validateLinks(owner, value, current);
    const now = new Date().toISOString(),
      nextVersion = current.version + 1,
      deletedAt = action === "trash" ? now : action === "restore" ? null : current.deletedAt;
    const title =
        action === "trash"
          ? "移入回收站"
          : action === "restore"
            ? "恢复"
            : action === "convert"
              ? "整理"
              : "更新",
      db = database();
    const results = await db.batch([
      db
        .prepare(
          "INSERT INTO revisions (id, owner, record_id, snapshot, created_at) SELECT ?, ?, ?, ?, ? FROM records WHERE id = ? AND owner = ? AND version = ?",
        )
        .bind(
          crypto.randomUUID(),
          owner,
          current.id,
          JSON.stringify(current),
          now,
          current.id,
          owner,
          current.version,
        ),
      db
        .prepare(
          "UPDATE records SET kind = ?, title = ?, content = ?, tags = ?, meta = ?, favorite = ?, pinned = ?, collection_id = ?, status = ?, due_at = ?, deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND owner = ? AND version = ? RETURNING *",
        )
        .bind(
          value.kind,
          value.title,
          value.content,
          JSON.stringify(value.tags),
          JSON.stringify(value.meta),
          value.favorite ? 1 : 0,
          value.pinned ? 1 : 0,
          value.collectionId,
          value.status,
          value.dueAt,
          deletedAt,
          now,
          nextVersion,
          current.id,
          owner,
          current.version,
        ),
      db
        .prepare(
          "INSERT INTO audit (id, owner, action, title, record_id, created_at) SELECT ?, ?, ?, ?, ?, ? FROM records WHERE id = ? AND owner = ? AND version = ? AND updated_at = ?",
        )
        .bind(
          crypto.randomUUID(),
          owner,
          title,
          value.title,
          current.id,
          now,
          current.id,
          owner,
          nextVersion,
          now,
        ),
      ...retention(db, owner, current.id),
    ]);
    if (!results[1].results.length) throw new ApiError(409, "记录已更新，请刷新后重试");
    await purgeExpiredTrash(owner);
    return json({ item: fromRow(results[1].results[0] as Record<string, unknown>) });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await authorize(request),
      data = await body(request);
    if (!data || typeof data.id !== "string") throw new ApiError(400, "记录参数无效");
    const item = await ownedRecord(owner, data.id);
    if (!item.deletedAt) throw new ApiError(400, "仅能彻底删除回收站中的记录");
    if (item.version !== data.version) throw new ApiError(409, "记录已更新，请刷新后重试");
    const statements = permanentDeleteStatements(database(), owner, item);
    const result = await database().batch(statements);
    if (!result[statements.length - 1].results.length)
      throw new ApiError(409, "记录已变化，请刷新后重试");
    return json({ ok: true, cleanupPending: await cleanBlobs(owner) });
  } catch (e) {
    return failure(e);
  }
}
