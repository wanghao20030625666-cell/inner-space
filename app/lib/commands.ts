import { modules, extraModules } from "./catalog";
import { type Collection, type Kind, type View } from "./model";
export type SpaceCommand = { id: string; label: string; detail: string } & (
  { action: "navigate"; view: View; collection?: string } | { action: "create"; kind: Kind }
);
/** Commands stay local; record results are fetched separately through the protected search API. */
export function spaceCommands(query: string, collections: Collection[]): SpaceCommand[] {
  const entries: SpaceCommand[] = [
    ...["note", "task", "event", "journal", "inbox"].map((kind) => ({
      id: `create-${kind}`,
      label:
        kind === "event"
          ? "新建日程"
          : kind === "inbox"
            ? "记到收集箱"
            : `新建${modules.find((m) => m.id === kind)!.name}`,
      detail: "创建内容",
      action: "create" as const,
      kind: kind as Kind,
    })),
    ...[...modules, ...extraModules].map((m) => ({
      id: `go-${m.id}`,
      label: `前往${m.name}`,
      detail: "切换模块",
      action: "navigate" as const,
      view: m.id,
    })),
    ...collections.map((c) => ({
      id: `collection-${c.id}`,
      label: c.name,
      detail: "我的专题",
      action: "navigate" as const,
      view: "collection" as const,
      collection: c.id,
    })),
  ];
  const q = query.trim().toLowerCase();
  return entries
    .filter((c) => !q || `${c.label} ${c.detail} ${c.id}`.toLowerCase().includes(q))
    .slice(0, q ? 30 : 14);
}
export function recordSearchPath(query: string) {
  const p = new URLSearchParams({ q: query.trim().slice(0, 200), lite: "1", scope: "active" });
  return `/api/space?${p}`;
}
