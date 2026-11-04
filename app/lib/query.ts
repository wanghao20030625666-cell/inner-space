import { kinds } from "./model";
import { ApiError } from "./errors";

/** Whitelisted SQL sort expressions keep keyset pagination stable for every view. */
export const sorts = {
  updated: { sql: "updated_at", direction: "DESC" },
  created: { sql: "created_at", direction: "DESC" },
  title: { sql: "lower(title)", direction: "ASC" },
  due: { sql: "COALESCE(due_at, '9999-12-31')", direction: "ASC" },
} as const;
export function recordQuery(owner: string, p: URLSearchParams) {
  const where = ["owner = ?"],
    values: (string | number)[] = [owner],
    scope = p.get("scope") || "active";
  if (scope === "trash") where.push("deleted_at IS NOT NULL");
  else {
    where.push("deleted_at IS NULL");
    if (scope === "archive") where.push("status = 'archived'");
    else if (scope !== "all") where.push("status != 'archived'");
  }
  if (scope === "favorites") where.push("favorite = 1");
  const q = (p.get("q") || "").slice(0, 200),
    kind = p.get("kind"),
    tag = p.get("tag"),
    collection = p.get("collection");
  if (p.get("id")) {
    where.push("id = ?");
    values.push(p.get("id")!);
  }
  if (p.get("undated") === "1") where.push("due_at IS NULL");
  if (q) {
    where.push(
      "(instr(lower(title),lower(?)) > 0 OR instr(lower(content),lower(?)) > 0 OR instr(lower(tags),lower(?)) > 0)",
    );
    values.push(q, q, q);
  }
  if (kind && kinds.includes(kind as (typeof kinds)[number])) {
    where.push("kind = ?");
    values.push(kind);
  }
  if (tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(records.tags) WHERE value = ?)");
    values.push(tag.slice(0, 24));
  }
  if (["active", "done"].includes(p.get("status") || "")) {
    where.push("status = ?");
    values.push(p.get("status")!);
  }
  if (collection === "none") where.push("collection_id IS NULL");
  else if (collection) {
    where.push("collection_id = ?");
    values.push(collection);
  }
  if (p.get("project")) {
    where.push("json_extract(meta,'$.projectId') = ?");
    values.push(p.get("project")!);
  }
  if (p.get("parent")) {
    where.push("json_extract(meta,'$.parentId') = ?");
    values.push(p.get("parent")!);
  }
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(p.get("month") || "")) {
    where.push("due_at LIKE ?");
    values.push(p.get("month")! + "%");
  }
  for (const [parameter, op] of [
    ["from", ">="],
    ["to", "<="],
  ])
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.get(parameter) || "")) {
      where.push(`due_at ${op} ?`);
      values.push(p.get(parameter)!);
    }
  if (p.get("reading") === "read") where.push("json_extract(meta,'$.readState') = 'read'");
  if (p.get("reading") === "unread")
    where.push("COALESCE(json_extract(meta,'$.readState'),'unread') != 'read'");
  if (["high", "normal", "low"].includes(p.get("priority") || "")) {
    where.push("COALESCE(json_extract(meta,'$.priority'),'normal') = ?");
    values.push(p.get("priority")!);
  }
  if (p.get("fileType") === "image") where.push("json_extract(meta,'$.mime') LIKE 'image/%'");
  if (p.get("fileType") === "document")
    where.push("COALESCE(json_extract(meta,'$.mime'),'') NOT LIKE 'image/%'");
  const totalWhere = where.join(" AND "),
    totalValues = [...values];
  const key = p.get("sort") as keyof typeof sorts,
    sort = sorts[key] || sorts.updated,
    cursor = p.get("cursor");
  if (cursor) {
    let after: unknown;
    try {
      after = JSON.parse(cursor);
    } catch {
      throw new ApiError(400, "分页参数无效");
    }
    if (
      !Array.isArray(after) ||
      after.length !== 3 ||
      ![0, 1].includes(after[0]) ||
      !after.slice(1).every((s) => typeof s === "string" && s.length <= 200)
    )
      throw new ApiError(400, "分页参数无效");
    const op = sort.direction === "ASC" ? ">" : "<";
    where.push(
      `(pinned < ? OR (pinned = ? AND (${sort.sql} ${op} ? OR (${sort.sql} = ? AND id < ?))))`,
    );
    values.push(after[0], after[0], after[1], after[1], after[2]);
  }
  return {
    where: where.join(" AND "),
    values,
    totalWhere,
    totalValues,
    order: `pinned DESC, ${sort.sql} ${sort.direction}, id DESC`,
    sortSql: sort.sql,
  };
}
