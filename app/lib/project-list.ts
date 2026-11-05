import { api, type Data } from "./client";
type Page = Pick<Data, "items" | "total" | "nextCursor" | "projectTasks">;
/** Read only the requested visible range; a refresh preserves previously opened pages. */
export async function loadProjectTasks(
  project: string,
  options: { cursor?: string | null; limit?: number } = {},
  request: (path: string) => Promise<Page> = (path) => api<Data>(path),
) {
  const limit = Math.max(200, Math.min(10000, options.limit || 200));
  let cursor = options.cursor || null,
    total = 0,
    done = 0;
  const items: Data["items"] = [],
    seen = new Set<string>();
  if (cursor) seen.add(cursor);
  do {
    const p = new URLSearchParams({
      kind: "task",
      project,
      scope: "active",
      lite: "1",
      ...(cursor ? { cursor } : {}),
    });
    const page = await request(`/api/space?${p}`);
    items.push(...page.items.filter((item) => !items.some((old) => old.id === item.id)));
    total = page.total;
    done = page.projectTasks.find((row) => row.projectId === project)?.done || 0;
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("项目列表已变化，请刷新后重试");
    if (cursor) seen.add(cursor);
  } while (cursor && items.length < limit);
  return { items, total, done, nextCursor: cursor };
}
