import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:5181",
  label = "功能验收-" + randomUUID().slice(0, 8),
  ids = [],
  groups = [];
let checks = 0;
function check(value, expected, why) {
  assert.deepEqual(value, expected, why);
  checks++;
}
async function request(path, method = "GET", value) {
  const r = await fetch(base + path, {
    method,
    headers: { Cookie: "__sites_local_auth=1", Origin: base, "Content-Type": "application/json" },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: r.status, value: await r.json() };
}
async function create(kind, values = {}) {
  const r = await request("/api/space", "POST", {
    kind,
    title: `${label}-${kind}`,
    tags: [label],
    ...values,
  });
  check(r.status, 201, "create " + kind);
  ids.push(r.value.item.id);
  return r.value.item;
}
async function update(item, values) {
  const r = await request("/api/space", "PATCH", { id: item.id, version: item.version, ...values });
  check(r.status, 200, "update");
  return r.value.item;
}
async function records(scope = "all") {
  return (await request(`/api/space?scope=${scope}&q=${encodeURIComponent(label)}`)).value;
}
try {
  const c = await request("/api/collections", "POST", { name: label, color: "clay" });
  check(c.status, 201, "create collection");
  const group = c.value.collection;
  groups.push(group.id);
  check(
    (await request("/api/collections", "POST", { name: " ", color: "green" })).status,
    400,
    "validate collection name",
  );
  check(
    (
      await request("/api/collections", "PATCH", {
        id: randomUUID(),
        name: "unknown",
        color: "green",
      })
    ).status,
    404,
    "unknown collection update",
  );
  let note = await create("note", {
    collectionId: group.id,
    pinned: true,
    content: "专题内的笔记",
  });
  const unpinned = await create("note", { content: "未归类的笔记" });
  const all = await records();
  check(all.items[0].id, note.id, "pinned records first");
  check(all.collections.find((c) => c.id === group.id).count, 1, "collection count");
  check(
    all.pinned.some((r) => r.id === note.id),
    true,
    "home pinning",
  );
  check(
    all.recent.some((r) => r.id === unpinned.id),
    true,
    "home recent edits include unpinned content",
  );
  const scoped = await request(`/api/space?collection=${group.id}`);
  check(scoped.value.total, 1, "collection server filter");
  check(scoped.value.items[0].id, note.id, "collection content");
  check(
    (
      await request("/api/space", "POST", {
        kind: "note",
        title: label,
        collectionId: randomUUID(),
      })
    ).status,
    400,
    "unknown relation denied",
  );
  let inbox = await create("inbox", { content: "收集到的一段文字", collectionId: group.id });
  const sourceId = inbox.id;
  inbox = await update(inbox, {
    action: "convert",
    kind: "bookmark",
    meta: { url: "https://example.com/reading", readState: "unread" },
  });
  check(inbox.id, sourceId, "conversion keeps identity");
  check(inbox.kind, "bookmark", "convert inbox");
  check(inbox.collectionId, group.id, "conversion keeps collection");
  const versions = await request(`/api/versions?id=${inbox.id}`);
  check(versions.value.versions[0].item.kind, "inbox", "conversion retains previous version");
  check(
    (
      await request("/api/space", "PATCH", {
        id: inbox.id,
        version: inbox.version,
        action: "convert",
        kind: "note",
      })
    ).status,
    400,
    "only inbox can convert",
  );
  check(
    (await request(`/api/space?kind=bookmark&reading=unread&q=${encodeURIComponent(label)}`)).value
      .total,
    1,
    "unread filter",
  );
  inbox = await update(inbox, { meta: { ...inbox.meta, readState: "read" } });
  check(
    (await request(`/api/space?kind=bookmark&reading=read&q=${encodeURIComponent(label)}`)).value
      .total,
    1,
    "read filter",
  );
  check(
    (await request(`/api/space?kind=bookmark&reading=unread&q=${encodeURIComponent(label)}`)).value
      .total,
    0,
    "unread excludes read",
  );
  let project = await create("project", { collectionId: group.id });
  let task = await create("task", {
    collectionId: group.id,
    dueAt: "2026-11-10",
    meta: { projectId: project.id, stage: "todo", priority: "high" },
  });
  task = await update(task, { meta: { ...task.meta, stage: "doing" } });
  check(task.meta.stage, "doing", "kanban stage");
  task = await update(task, { status: "done", meta: { ...task.meta, stage: "done" } });
  const tasks = await request(`/api/space?kind=task&project=${project.id}&status=done`);
  check(tasks.value.total, 1, "project task filter");
  const summary = tasks.value.projectTasks.find((p) => p.projectId === project.id);
  check(summary, { projectId: project.id, total: 1, done: 1 }, "derived project progress");
  await create("journal", { dueAt: "2026-10-20" });
  await create("journal", { dueAt: "2026-11-04" });
  check(
    (await request(`/api/space?kind=journal&month=2026-10&q=${encodeURIComponent(label)}`)).value
      .total,
    1,
    "month filter",
  );
  const renamed = await request("/api/collections", "PATCH", {
    id: group.id,
    name: label + "-新名称",
    color: "blue",
  });
  check(renamed.status, 200, "rename collection");
  project = await update(project, { action: "trash" });
  task = await update(task, { title: label + "-项目删除后仍可修改待办" });
  check(task.title.endsWith("仍可修改待办"), true, "existing task survives deleted project");
  const removed = await request("/api/collections", "DELETE", { id: group.id });
  check(removed.status, 200, "remove collection");
  const detached = (await records()).items.find((r) => r.id === note.id);
  check(detached.collectionId, null, "remove collection keeps content");
  check(detached.content, note.content, "content preserved");
  check(detached.version, note.version + 1, "relation removal invalidates stale editors");
  check(
    (await request("/api/space", "PATCH", { id: note.id, version: note.version, content: "stale" }))
      .status,
    409,
    "stale edit after collection removal",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      assertions: checks,
      features: [
        "collections",
        "pinning",
        "inbox conversion",
        "reading state",
        "project tasks",
        "kanban state",
        "month filter",
        "safe collection removal",
      ],
    }),
  );
} finally {
  for (const scope of ["all", "trash"]) {
    const r = await records(scope);
    for (let item of r.items.filter((x) => ids.includes(x.id))) {
      if (!item.deletedAt)
        item = (
          await request("/api/space", "PATCH", {
            id: item.id,
            version: item.version,
            action: "trash",
          })
        ).value.item;
      if (item) await request("/api/space", "DELETE", { id: item.id, version: item.version });
    }
  }
  for (const id of groups) await request("/api/collections", "DELETE", { id });
}
