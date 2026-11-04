import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:5181",
  owner = "local_seedy",
  foreign = "round3-foreign",
  label = "round3-" + randomUUID().slice(0, 8);
const dir = resolve(".wrangler/state/v3/d1"),
  filename = readdirSync(dir, { recursive: true }).find(
    (f) => f.endsWith(".sqlite") && !f.endsWith("metadata.sqlite"),
  ),
  db = new DatabaseSync(resolve(dir, filename));
const originalSettings = db.prepare("SELECT value FROM settings WHERE owner = ?").get(owner);
const ids = [],
  groups = [];
let assertions = 0;
const check = (value, expected, message) => {
  assert.deepEqual(value, expected, message);
  assertions++;
};
async function request(path, method = "GET", value) {
  const response = await fetch(base + path, {
    method,
    headers: { Cookie: "__sites_local_auth=1", Origin: base, "Content-Type": "application/json" },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, value: await response.json() };
}
function record(
  kind = "note",
  { who = owner, collection = null, meta = {}, status = "active", deleted = null } = {},
) {
  const id = randomUUID();
  ids.push(id);
  db.prepare(
    "INSERT INTO records(id,owner,kind,title,tags,meta,status,collection_id,deleted_at,created_at,updated_at) VALUES(?,?,?,?,'[]',?,?,?,?,?,?)",
  ).run(
    id,
    who,
    kind,
    label,
    JSON.stringify(meta),
    status,
    collection,
    deleted,
    new Date().toISOString(),
    new Date().toISOString(),
  );
  return id;
}
const exists = (id) => !!db.prepare("SELECT id FROM records WHERE id=?").get(id);
async function savePrefs(changes) {
  const current = (await request("/api/preferences")).value.preferences;
  const result = await request("/api/preferences", "PUT", {
    ...current,
    ...changes,
    expectedPreferences: current,
  });
  check(result.status, 200, "save preferences");
  return result.value.preferences;
}
try {
  await savePrefs({ trashRetentionDays: 0 });
  const project = record("project");
  db.exec("BEGIN");
  for (let i = 0; i < 205; i++)
    record("task", { meta: { projectId: project }, status: i < 100 ? "done" : "active" });
  record("task", { who: foreign, meta: { projectId: project }, status: "done" });
  record("task", { meta: { projectId: project }, status: "archived" });
  record("task", {
    meta: { projectId: project },
    status: "done",
    deleted: new Date().toISOString(),
  });
  db.exec("COMMIT");
  let r = await request(`/api/space?kind=task&project=${project}&lite=1`);
  check(r.status, 200, "project lite");
  check(r.value.items.length, 200, "paged task list");
  check(r.value.total, 205, "all task count");
  check(
    r.value.projectTasks,
    [{ projectId: project, total: 205, done: 100 }],
    "complete owner-scoped progress beyond first page",
  );
  check("ledger" in r.value, false, "no dashboard aggregates");
  const baseline = (await request("/api/preferences")).value.preferences;
  r = await request("/api/preferences", "PUT", {
    ...baseline,
    name: label,
    expectedPreferences: baseline,
  });
  check(r.status, 200, "first window saves");
  r = await request("/api/preferences", "PUT", {
    ...baseline,
    motto: "stale",
    expectedPreferences: baseline,
  });
  check(r.status, 409, "stale window cannot overwrite");
  check((await request("/api/preferences")).value.preferences.name, label, "newer value preserved");
  const latest = (await request("/api/preferences")).value.preferences;
  const simultaneous = await Promise.all(
    ["one", "two"].map((motto) =>
      request("/api/preferences", "PUT", { ...latest, motto, expectedPreferences: latest }),
    ),
  );
  check(simultaneous.map((x) => x.status).sort(), [200, 409], "atomic compare and swap");
  check(
    (await request("/api/preferences", "PUT", { ...latest, trashRetentionDays: 2 })).status,
    400,
    "unsupported retention rejected",
  );
  for (let i = 0; i < 2; i++) {
    const id = randomUUID();
    groups.push(id);
    db.prepare(
      "INSERT INTO collections(id,owner,name,color,created_at) VALUES(?,?,?,'green',?)",
    ).run(id, owner, label, new Date().toISOString());
  }
  const selected = record("note", { collection: groups[0] }),
    other = record("note", { collection: groups[1] }),
    attachment = record("file", { meta: { parentId: selected } }),
    foreignAttachment = record("file", { who: foreign, meta: { parentId: selected } }),
    trashed = record("note", { collection: groups[0], deleted: new Date().toISOString() });
  for (const id of [selected, other, attachment]) {
    db.prepare(
      "INSERT INTO audit(id,owner,action,title,record_id,created_at) VALUES(?,?,'测试',?,?,?)",
    ).run(randomUUID(), owner, label, id, new Date().toISOString());
    db.prepare(
      "INSERT INTO revisions(id,owner,record_id,snapshot,created_at) VALUES(?,?,?,'{}',?)",
    ).run(randomUUID(), owner, id, new Date().toISOString());
  }
  r = await request(`/api/space?collection=${groups[0]}&includeAttachments=1&scope=all&lite=1`);
  check(
    r.value.items.map((x) => x.id).sort(),
    [selected, attachment].sort(),
    "collection includes linked file outside its collection",
  );
  check(
    r.value.items.some((x) => x.id === foreignAttachment),
    false,
    "foreign attachments excluded",
  );
  r = await request(`/api/space?collection=${groups[0]}&includeAttachments=1&scope=trash&lite=1`);
  check(
    r.value.items.map((x) => x.id),
    [trashed],
    "collection trash exported separately",
  );
  for (const history of ["0", "1"]) {
    r = await request(`/api/activity?collection=${groups[0]}&history=${history}`);
    check(
      r.value.rows
        .filter((x) => [selected, other, attachment].includes(x.recordId))
        .map((x) => x.recordId)
        .sort(),
      [selected, attachment].sort(),
      "archives remain collection-scoped",
    );
  }
  const oldDate = new Date(Date.now() - 40 * 86400000).toISOString(),
    recentDate = new Date(Date.now() - 5 * 86400000).toISOString();
  const old = record("note", { deleted: oldDate }),
    restore = record("note", { deleted: oldDate }),
    recent = record("note", { deleted: recentDate }),
    untouched = record(),
    foreignOld = record("note", { who: foreign, deleted: oldDate });
  db.prepare("INSERT INTO drafts(id,owner,key,data,version,updated_at) VALUES(?,?,?,'{}',1,?)").run(
    `${owner}:${old}`,
    owner,
    old,
    new Date().toISOString(),
  );
  db.prepare(
    "INSERT INTO revisions(id,owner,record_id,snapshot,created_at) VALUES(?,?,?,'{}',?)",
  ).run(randomUUID(), owner, old, new Date().toISOString());
  const trigger = record();
  await request("/api/space", "PATCH", { id: trigger, version: 1, content: "retention disabled" });
  check(exists(old), true, "default off preserves expired trash");
  // Expiry tests must never opt unrelated local preview trash into deletion.
  const unrelatedExpired = db
    .prepare("SELECT id FROM records WHERE owner=? AND deleted_at < ?")
    .all(owner, new Date(Date.now() - 30 * 86400000).toISOString())
    .filter((r) => !ids.includes(r.id));
  assert.equal(
    unrelatedExpired.length,
    0,
    "Use an isolated test database: unrelated expired trash is present",
  );
  await savePrefs({ trashRetentionDays: 30 });
  check(exists(old), true, "changing settings does not immediately delete");
  await request("/api/space?lite=1");
  check(exists(old), true, "reads never purge");
  r = await request("/api/space", "PATCH", { id: restore, version: 1, action: "restore" });
  check(r.status, 200, "restore happens before maintenance");
  check(exists(restore), true, "restored record survives");
  check(exists(old), false, "expired own record purged on content write");
  check(exists(recent), true, "recent trash kept");
  check(exists(untouched), true, "active content kept");
  check(exists(foreignOld), true, "foreign trash kept");
  check(
    db.prepare("SELECT count(*) AS n FROM drafts WHERE owner=? AND key=?").get(owner, old).n,
    0,
    "expired draft removed",
  );
  check(
    db.prepare("SELECT count(*) AS n FROM revisions WHERE owner=? AND record_id=?").get(owner, old)
      .n,
    0,
    "expired revisions removed",
  );
  check(
    db
      .prepare(
        "SELECT count(*) AS n FROM audit WHERE owner=? AND record_id=? AND action='到期清理'",
      )
      .get(owner, old).n,
    1,
    "single cleanup audit",
  );
  const expired = [];
  for (let i = 0; i < 22; i++) expired.push(record("note", { deleted: oldDate }));
  r = await request("/api/space", "PATCH", { id: trigger, version: 2, content: "bounded cleanup" });
  check(r.status, 200, "cleanup trigger");
  check(expired.filter(exists).length, 2, "bounded sweep twenty records");
  await request("/api/space", "PATCH", { id: trigger, version: 3, content: "next sweep" });
  check(expired.filter(exists).length, 0, "remaining records next write");
  await savePrefs({ trashRetentionDays: 0 });
  const disabledOld = record("note", { deleted: oldDate });
  await request("/api/space", "PATCH", { id: trigger, version: 4, content: "disabled again" });
  check(exists(disabledOld), true, "disable stops further deletion");
  console.log(
    JSON.stringify({
      ok: true,
      assertions,
      coverage: [
        "project lite complete totals",
        "settings concurrency",
        "collection and archive scope",
        "opt-in trash expiry",
        "restore ordering",
        "bounded cleanup",
      ],
    }),
  );
} finally {
  // Exact fixture IDs only; never touch other local content or the production database.
  for (const id of ids) {
    db.prepare("DELETE FROM records WHERE id=?").run(id);
    db.prepare("DELETE FROM drafts WHERE key=? AND owner IN (?,?)").run(id, owner, foreign);
    db.prepare("DELETE FROM revisions WHERE record_id=? AND owner IN (?,?)").run(
      id,
      owner,
      foreign,
    );
    db.prepare("DELETE FROM audit WHERE record_id=? AND owner IN (?,?)").run(id, owner, foreign);
  }
  for (const id of groups)
    db.prepare("DELETE FROM collections WHERE id=? AND owner=?").run(id, owner);
  if (originalSettings)
    db.prepare(
      "INSERT INTO settings(owner,value) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value",
    ).run(owner, originalSettings.value);
  else db.prepare("DELETE FROM settings WHERE owner=?").run(owner);
  db.close();
}
