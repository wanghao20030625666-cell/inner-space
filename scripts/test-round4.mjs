import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:5181",
  owner = "local_seedy",
  foreign = "round4-foreign",
  label = "round4-" + randomUUID().slice(0, 8);
const dir = resolve(".wrangler/state/v3/d1"),
  file = readdirSync(dir, { recursive: true }).find(
    (f) => f.endsWith(".sqlite") && !f.endsWith("metadata.sqlite"),
  ),
  db = new DatabaseSync(resolve(dir, file));
const ids = [],
  groups = [],
  stamp = new Date().toISOString();
let assertions = 0;
const originalSettings = db.prepare("SELECT value FROM settings WHERE owner=?").get(owner);
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}
async function request(path, method = "GET", value, auth = true) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(auth ? { Cookie: "__sites_local_auth=1" } : {}),
      Origin: base,
      "Content-Type": "application/json",
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: r.status, value: await r.json() };
}
function seed({ who = owner, trash = true, kind = "note", meta = {}, collection = null } = {}) {
  const id = randomUUID();
  ids.push(id);
  db.prepare(
    "INSERT INTO records(id,owner,kind,title,tags,meta,collection_id,deleted_at,created_at,updated_at) VALUES(?,?,?,?,'[]',?,?,?,?,?)",
  ).run(id, who, kind, label, JSON.stringify(meta), collection, trash ? stamp : null, stamp, stamp);
  return { id, version: 1 };
}
const exists = (id) => !!db.prepare("SELECT id FROM records WHERE id=?").get(id);
try {
  if (originalSettings)
    db.prepare("UPDATE settings SET value=? WHERE owner=?").run(
      JSON.stringify({ ...JSON.parse(originalSettings.value), trashRetentionDays: 0 }),
      owner,
    );
  const first = seed(),
    active = seed({ trash: false }),
    theirs = seed({ who: foreign }),
    stale = seed(),
    restored = seed();
  db.prepare("UPDATE records SET version=2 WHERE id=?").run(stale.id);
  db.prepare("UPDATE records SET version=2,deleted_at=NULL WHERE id=?").run(restored.id);
  db.prepare("INSERT INTO revisions VALUES(?,?,?,?,?)").run(
    randomUUID(),
    owner,
    first.id,
    "{}",
    stamp,
  );
  db.prepare("INSERT INTO drafts VALUES(?,?,?,?,?,?)").run(
    randomUUID(),
    owner,
    first.id,
    "{}",
    1,
    stamp,
  );
  const snapshot = (await request("/api/trash")).value.items;
  check(
    snapshot.some((r) => r.id === first.id),
    true,
    "review includes own trash",
  );
  check(
    snapshot.some((r) => r.id === theirs.id),
    false,
    "review hides foreign IDs",
  );
  check(
    snapshot.some((r) => r.id === active.id),
    false,
    "review excludes active",
  );
  check(exists(first.id), true, "GET never deletes");
  check(
    (await request("/api/trash", "GET", undefined, false)).status,
    401,
    "snapshot requires login",
  );
  check(
    (await request("/api/trash", "POST", { items: [first] }, false)).status,
    401,
    "write requires login",
  );
  for (const items of [
    [],
    Array.from({ length: 11 }, () => ({ id: randomUUID(), version: 1 })),
    [first, first],
    [{ ...first, version: 0 }],
    [{ id: "bad", version: 1 }],
  ])
    check(
      (await request("/api/trash", "POST", { items })).status,
      400,
      "bounded validated deletion batch",
    );
  check(exists(first.id), true, "invalid batch has no writes");
  let r = await request("/api/trash", "POST", { items: [first, active, theirs, stale, restored] });
  check(r.status, 200, "mixed batch returns results");
  check(
    r.value.results.map((r) => r.status),
    ["deleted", "changed", "unavailable", "changed", "changed"],
    "ownership and versions checked per record",
  );
  check(
    [active, theirs, stale, restored].every((r) => exists(r.id)),
    true,
    "ineligible records preserved",
  );
  check(exists(first.id), false, "eligible record deleted");
  check(
    db.prepare("SELECT count(*) AS n FROM revisions WHERE record_id=?").get(first.id).n,
    0,
    "history removed",
  );
  check(
    db.prepare("SELECT count(*) AS n FROM drafts WHERE key=?").get(first.id).n,
    0,
    "record draft removed",
  );
  check(
    db
      .prepare("SELECT count(*) AS n FROM audit WHERE record_id=? AND action='彻底删除'")
      .get(first.id).n,
    1,
    "single audit entry",
  );
  check(
    (await request("/api/trash", "POST", { items: [first] })).value.results[0].status,
    "unavailable",
    "repeat request does not repeat delete",
  );
  const page = Array.from({ length: 205 }, () => seed());
  const reviewed = (await request("/api/trash")).value.items.filter((r) =>
    page.some((p) => p.id === r.id),
  );
  check(reviewed.length, 205, "review spans beyond first 200 rows");
  const later = seed();
  for (let i = 0; i < reviewed.length; i += 10) {
    r = await request("/api/trash", "POST", { items: reviewed.slice(i, i + 10) });
    assert.equal(r.status, 200);
    assert.equal(
      r.value.results.every((r) => r.status === "deleted"),
      true,
    );
  }
  check(
    reviewed.every((r) => !exists(r.id)),
    true,
    "snapshot can be drained in bounded batches",
  );
  check(exists(later.id), true, "new trash after confirmation is preserved");
  const group = randomUUID();
  groups.push(group);
  db.prepare("INSERT INTO collections VALUES(?,?,?,?,?)").run(group, owner, label, "green", stamp);
  const project = seed({ trash: false, kind: "project", collection: group });
  for (let i = 0; i < 205; i++) {
    const task = seed({ trash: false, kind: "task", meta: { projectId: project.id } });
    if (i < 100) db.prepare("UPDATE records SET status='done' WHERE id=?").run(task.id);
  }
  seed({ trash: false, kind: "task", who: foreign, meta: { projectId: project.id } });
  seed({
    trash: false,
    kind: "expense",
    meta: { amount: "38.50", direction: "out", category: label },
  });
  const url = "/api/space?lite=1&context=module&q=" + label;
  r = await request(url + "&kind=note");
  check(
    ["recent", "pinned", "onThisDay", "reminders", "activity", "ledger", "projectTasks"].some(
      (key) => key in r.value,
    ),
    false,
    "ordinary modules omit dashboard projections",
  );
  check(
    ["collections", "counts", "tags", "stats", "preferences"].every((key) => key in r.value),
    true,
    "sidebar and editor context retained",
  );
  check(
    r.value.collections.some((c) => c.id === group),
    true,
    "collection freshly available",
  );
  r = await request(url + "&kind=project");
  check(
    r.value.projectTasks.find((p) => p.projectId === project.id),
    { projectId: project.id, total: 205, done: 100 },
    "complete owner-scoped project progress on module route",
  );
  r = await request(url + "&collection=" + group);
  check(
    r.value.projectTasks.find((p) => p.projectId === project.id)?.total,
    205,
    "mixed collection cards retain full project progress",
  );
  r = await request(url + "&kind=expense");
  check(r.value.ledger.expenseCents, 3850, "filtered ledger cents retained");
  check(r.value.ledger.count, 1, "filtered ledger count retained");
  check(r.value.ledger.categories, [{ name: label, cents: 3850 }], "filtered categories retained");
  check("reminders" in r.value, false, "ledger skips reminders");
  r = await request("/api/space?lite=1");
  check(
    ["counts", "stats", "projectTasks", "ledger"].some((key) => key in r.value),
    false,
    "pagination stays two-query payload",
  );
  r = await request("/api/space");
  check(
    ["recent", "reminders", "onThisDay", "activity", "ledger", "projectTasks"].every(
      (key) => key in r.value,
    ),
    true,
    "homepage retains full payload",
  );
  // Exercise a real blob through the same deletion outbox, not a synthetic R2 key.
  const form = new FormData();
  form.set("file", new File([label], label + ".txt", { type: "text/plain" }));
  form.set("kind", "file");
  const uploaded = await fetch(base + "/api/upload", {
    method: "POST",
    headers: { Cookie: "__sites_local_auth=1", Origin: base },
    body: form,
  });
  const upload = await uploaded.json();
  check(uploaded.status, 201, "upload fixture");
  ids.push(upload.item.id);
  const trash = (
    await request("/api/space", "PATCH", {
      id: upload.item.id,
      version: upload.item.version,
      action: "trash",
    })
  ).value.item;
  r = await request("/api/trash", "POST", { items: [{ id: trash.id, version: trash.version }] });
  check(r.value.results[0].status, "deleted", "file record removed via batch");
  check(r.value.cleanupPending, 0, "blob cleanup completed");
  check(
    (await fetch(base + "/api/files/" + trash.id, { headers: { Cookie: "__sites_local_auth=1" } }))
      .status,
    404,
    "deleted blob endpoint inaccessible",
  );
  console.log(
    JSON.stringify({
      ok: true,
      assertions,
      features: [
        "snapshot bulk deletion",
        "owner/version guards",
        "unfiltered trash snapshot",
        "module-specific data",
      ],
    }),
  );
} finally {
  for (const id of ids) {
    const row = db
      .prepare("SELECT kind,version,deleted_at FROM records WHERE id=? AND owner=?")
      .get(id, owner);
    if (row && ["file", "photo"].includes(row.kind)) {
      if (!row.deleted_at)
        await request("/api/space", "PATCH", { id, version: row.version, action: "trash" });
      const latest = db.prepare("SELECT version FROM records WHERE id=?").get(id);
      await request("/api/space", "DELETE", { id, version: latest.version });
    }
    for (const [table, column] of [
      ["records", "id"],
      ["revisions", "record_id"],
      ["audit", "record_id"],
      ["drafts", "key"],
    ])
      db.prepare(`DELETE FROM ${table} WHERE ${column}=? AND owner IN (?,?)`).run(
        id,
        owner,
        foreign,
      );
  }
  for (const id of groups)
    db.prepare("DELETE FROM collections WHERE id=? AND owner=?").run(id, owner);
  if (originalSettings)
    db.prepare("UPDATE settings SET value=? WHERE owner=?").run(originalSettings.value, owner);
  db.close();
}
