import { kinds, localDate, type Kind, type SpaceRecord, type View } from "./model";
import type { Data } from "./client";
export type SpaceFilters = {
  view: View;
  search: string;
  collectionId: string;
  tag: string;
  status: string;
  reading: string;
  month: string;
  sort: string;
  priority: string;
  deadline: string;
  fileType: string;
  kindFilter: string;
  today: string;
};
/** A single parameter builder is shared by page loading and conservative local updates. */
export function spaceParams(f: SpaceFilters) {
  const p = new URLSearchParams({
    today: f.today,
    scope:
      f.view === "trash"
        ? "trash"
        : f.view === "archive"
          ? "archive"
          : f.view === "favorites"
            ? "favorites"
            : "active",
  });
  if (f.search) p.set("q", f.search);
  else {
    if (kinds.includes(f.view as Kind)) p.set("kind", f.view);
    if (f.collectionId) p.set("collection", f.collectionId);
  }
  for (const [key, value] of [
    ["tag", f.tag],
    ["month", f.month],
    ["priority", f.priority],
    ["fileType", f.fileType],
  ])
    if (value) p.set(key, value);
  if (f.status !== "all") p.set("status", f.status);
  if (f.reading !== "all") p.set("reading", f.reading);
  p.set("sort", f.sort);
  if (f.search && f.kindFilter) p.set("kind", f.kindFilter);
  if (f.deadline) {
    p.set("status", "active");
    const end = new Date(f.today + "T12:00:00");
    if (f.deadline === "overdue") {
      end.setDate(end.getDate() - 1);
      p.set("to", localDate(end));
    } else if (f.deadline === "undated") p.set("undated", "1");
    else {
      p.set("from", f.today);
      if (f.deadline === "week") end.setDate(end.getDate() + 6);
      p.set("to", localDate(end));
    }
  }
  return p;
}
/** Only edits that cannot change membership, totals or pagination may avoid a server refresh. */
export function canPatchRecord(
  p: URLSearchParams,
  before: SpaceRecord | undefined,
  after: SpaceRecord,
) {
  if (!p.has("kind")) return false;
  if (!before || before.id !== after.id || before.kind !== after.kind) return false;
  if (
    [
      "q",
      "tag",
      "month",
      "from",
      "to",
      "undated",
      "priority",
      "fileType",
      "reading",
      "project",
      "parent",
    ].some((key) => p.has(key))
  )
    return false;
  if (
    ["status", "favorite", "pinned", "collectionId", "dueAt", "deletedAt"].some(
      (key) => before[key as keyof SpaceRecord] !== after[key as keyof SpaceRecord],
    )
  )
    return false;
  if (JSON.stringify(before.tags) !== JSON.stringify(after.tags)) return false;
  const checked =
    after.kind === "expense"
      ? ["amount", "direction", "category"]
      : after.kind === "bookmark"
        ? ["readState"]
        : after.kind === "task"
          ? ["projectId"]
          : [];
  if (checked.some((key) => before.meta[key] !== after.meta[key])) return false;
  if (p.get("sort") === "title" && before.title !== after.title) return false;
  return true;
}
/** Replace every known projection; dates use the same ISO ordering as the API. */
export function patchRecordData(data: Data, item: SpaceRecord, sort = "updated"): Data {
  const replace = (rows: SpaceRecord[]) => rows.map((r) => (r.id === item.id ? item : r)),
    items = replace(data.items);
  if (sort === "updated")
    items.sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : a.id > b.id ? -1 : 1),
    );
  return {
    ...data,
    items,
    recent: replace(data.recent).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    pinned: replace(data.pinned),
    dueTasks: replace(data.dueTasks),
    upcoming: replace(data.upcoming),
    onThisDay: replace(data.onThisDay),
  };
}
