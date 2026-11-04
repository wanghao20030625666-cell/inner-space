import { strToU8, strFromU8, zip, unzipSync, type Zippable, type Unzipped } from "fflate";
import { api, type Data } from "./client";
import { allRecords, download } from "./exports";
import {
  recordInput,
  localDate,
  type SpaceRecord,
  type Collection,
  type Preferences,
} from "./model";
const LIMIT = 100 * 1024 * 1024;
type Backup = {
  format: string;
  records: SpaceRecord[];
  collections?: Collection[];
  preferences?: Preferences;
  files?: Record<string, { path: string; sha256: string }>;
};
async function hash(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function archiveRows(history: boolean) {
  const rows: unknown[] = [];
  let cursor: string | null = null,
    size = 0;
  do {
    const p = new URLSearchParams({ history: history ? "1" : "0" });
    if (cursor) p.set("cursor", cursor);
    const result: { rows: unknown[]; nextCursor: string | null } = await api(`/api/activity?${p}`);
    size += strToU8(JSON.stringify(result.rows)).length;
    if (size > 10 * 1024 * 1024)
      throw new Error("历史或操作记录归档超过 10 MB，本次 ZIP 未生成；请使用 JSON 并单独下载附件");
    rows.push(...result.rows);
    cursor = result.nextCursor;
  } while (cursor);
  return rows;
}

/** Export current/trash records and checked attachment bytes; history stays archival. */
export async function exportBackup(withFiles: boolean, progress: (s: string) => void) {
  progress("正在读取全部记录");
  const records = [
      ...(await allRecords()),
      ...(await allRecords(new URLSearchParams({ scope: "trash" }))),
    ],
    data = await api<Data>("/api/space");
  const backup: Backup & { exportedAt: string } = {
    format: withFiles ? "inner-space-v3" : "inner-space-v2",
    exportedAt: new Date().toISOString(),
    records,
    collections: data.collections,
    preferences: data.preferences,
  };
  if (strToU8(JSON.stringify(backup)).length > 10 * 1024 * 1024)
    throw new Error("记录清单超过 10 MB，请先按模块导出内容并分批整理备份");
  if (!withFiles) {
    download(JSON.stringify(backup), `隐序-记录备份-${localDate()}.json`, "application/json");
    return;
  }
  const files = records.filter((r) => ["file", "photo"].includes(r.kind)),
    entries: Zippable = {},
    manifest: NonNullable<Backup["files"]> = {};
  let size = 0;
  if (files.reduce((n, r) => n + Number(r.meta.size || 0), 0) > LIMIT)
    throw new Error("附件超过 100 MB，请先导出 JSON，并在文件库分批下载附件");
  for (let i = 0; i < files.length; i++) {
    const r = files[i];
    progress(`正在读取附件 ${i + 1}/${files.length} · ${r.title}`);
    const response = await fetch(`/api/files/${r.id}?backup=1`, { cache: "no-store" });
    if (!response.ok) throw new Error(`附件“${r.title}”读取失败，备份未生成`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    size += bytes.length;
    if (size > LIMIT) throw new Error("备份附件超过 100 MB，请分批下载");
    const path = `files/${r.id}`;
    manifest[r.id] = { path, sha256: await hash(bytes) };
    entries[path] = [bytes, { level: 0 }];
  }
  backup.files = manifest;
  entries["backup.json"] = strToU8(JSON.stringify(backup));
  progress("正在归档历史与操作记录");
  entries["history.json"] = strToU8(JSON.stringify(await archiveRows(true)));
  entries["activity.json"] = strToU8(JSON.stringify(await archiveRows(false)));
  entries["说明.txt"] = strToU8(
    "隐序记录与附件备份。导入恢复记录、专题、项目关联及附件；历史版本和操作记录作为归档文件保留，不回写。导入会新增副本，不覆盖现有记录。\n",
  );
  progress("正在生成 ZIP");
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 1 }, (error, value) => (error ? reject(error) : resolve(value))),
  );
  download(new Uint8Array(bytes).buffer, `隐序-带附件备份-${localDate()}.zip`, "application/zip");
}

/** Validate every record and byte hash before the first write, including ZIP size bounds. */
export async function readBackup(file: File) {
  if (file.size > LIMIT + 10 * 1024 * 1024) throw new Error("备份文件超过 110 MB");
  let backup: Backup,
    entries: Unzipped = {};
  if (file.name.toLowerCase().endsWith(".zip")) {
    let total = 0,
      count = 0;
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => {
        total += entry.originalSize;
        count++;
        if (
          !Number.isFinite(entry.originalSize) ||
          entry.originalSize < 0 ||
          total > LIMIT + 10 * 1024 * 1024 ||
          entry.originalSize > 26 * 1024 * 1024 ||
          count > 10000
        )
          throw new Error("ZIP 解压内容超过限制");
        return true;
      },
    });
    if (!entries["backup.json"]) throw new Error("ZIP 缺少 backup.json");
    backup = JSON.parse(strFromU8(entries["backup.json"]));
  } else {
    if (file.size > 10 * 1024 * 1024) throw new Error("JSON 不能超过 10 MB");
    backup = JSON.parse(await file.text());
  }
  if (
    !backup ||
    !["inner-space-v1", "inner-space-v2", "inner-space-v3"].includes(backup.format) ||
    !Array.isArray(backup.records) ||
    backup.records.length > 1000
  )
    throw new Error("请选择隐序备份，一次最多恢复 1000 条记录");
  const ids = new Set<string>();
  for (const r of backup.records) {
    if (!r || typeof r.id !== "string" || ids.has(r.id)) throw new Error("备份记录 ID 无效或重复");
    ids.add(r.id);
    const parsed = recordInput.safeParse({
      ...r,
      collectionId: null,
      meta: { ...r.meta, projectId: "", parentId: "" },
    });
    if (!parsed.success)
      throw new Error(`“${r.title || "记录"}”格式无效：${parsed.error.issues[0].message}`);
    if (["file", "photo"].includes(r.kind) && backup.format === "inner-space-v3") {
      const info = backup.files?.[r.id],
        bytes = info && entries[info.path];
      if (!bytes || bytes.length > 25 * 1024 * 1024 || (await hash(bytes)) !== info?.sha256)
        throw new Error(`“${r.title}”的附件缺失或校验失败`);
    }
  }
  const groups = backup.collections || [];
  if (
    !Array.isArray(groups) ||
    groups.length > 100 ||
    groups.some(
      (c) =>
        !c ||
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        !c.name.trim() ||
        c.name.length > 40,
    ) ||
    new Set(groups.map((c) => c.id)).size !== groups.length
  )
    throw new Error("专题数据无效");
  return { backup, entries };
}
export type PreparedBackup = Awaited<ReturnType<typeof readBackup>>;
/** Append-only restore maps all relation IDs; completed writes are reported on failure. */
export async function restoreBackup(prepared: PreparedBackup, progress: (s: string) => void) {
  const { backup, entries } = prepared,
    groups = new Map<string, string>(),
    ids = new Map<string, string>(),
    trash: { id: string; version: number }[] = [];
  let count = 0,
    files = 0,
    skipped = 0;
  try {
    const existing = await api<Data>("/api/space");
    if (existing.collections.length + (backup.collections?.length || 0) > 100)
      throw new Error("导入后专题会超过 100 个，请先整理专题");
    for (const c of backup.collections || []) {
      const result = await api<{ collection: Collection }>("/api/collections", {
        method: "POST",
        body: JSON.stringify({
          name: c.name,
          color: ["green", "clay", "blue", "purple", "gray"].includes(c.color) ? c.color : "green",
        }),
      });
      groups.set(c.id, result.collection.id);
    }
    const sorted = [...backup.records].sort(
      (a, b) =>
        (["file", "photo"].includes(a.kind) ? 2 : a.kind === "project" ? 0 : 1) -
        (["file", "photo"].includes(b.kind) ? 2 : b.kind === "project" ? 0 : 1),
    );
    for (const r of sorted) {
      progress(`正在恢复 ${count + 1}/${sorted.length} · ${r.title}`);
      let item: SpaceRecord;
      if (["file", "photo"].includes(r.kind)) {
        if (backup.format !== "inner-space-v3") {
          skipped++;
          continue;
        }
        const bytes = entries[backup.files![r.id].path],
          form = new FormData();
        form.set(
          "file",
          new File([new Uint8Array(bytes).buffer], String(r.meta.filename || r.title)),
        );
        form.set("kind", r.kind);
        if (groups.has(r.collectionId || ""))
          form.set("collectionId", groups.get(r.collectionId!)!);
        if (ids.has(String(r.meta.parentId)))
          form.set("parentId", ids.get(String(r.meta.parentId))!);
        item = (await api<{ item: SpaceRecord }>("/api/upload", { method: "POST", body: form }))
          .item;
        item = (
          await api<{ item: SpaceRecord }>("/api/space", {
            method: "PATCH",
            body: JSON.stringify({
              id: item.id,
              version: item.version,
              title: r.title,
              content: r.content,
              tags: r.tags,
              status: r.status,
              pinned: r.pinned,
              favorite: r.favorite,
              dueAt: r.dueAt,
            }),
          })
        ).item;
        files++;
      } else {
        item = (
          await api<{ item: SpaceRecord }>("/api/space", {
            method: "POST",
            body: JSON.stringify({
              ...r,
              collectionId: groups.get(r.collectionId || "") || null,
              meta: { ...r.meta, projectId: ids.get(String(r.meta.projectId)) || "" },
            }),
          })
        ).item;
      }
      ids.set(r.id, item.id);
      count++;
      if (r.deletedAt) trash.push({ id: item.id, version: item.version });
    }
    // Restore all relation targets before returning their source records to trash.
    for (const item of trash)
      await api("/api/space", {
        method: "PATCH",
        body: JSON.stringify({ ...item, action: "trash" }),
      });
    return { count, groups: groups.size, files, skipped };
  } catch (e) {
    throw new Error(
      `已恢复 ${count} 条内容、${files} 个附件、${groups.size} 个专题。${e instanceof Error ? e.message : "后续恢复失败"}`,
    );
  }
}
