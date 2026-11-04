import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:5181",
  label = "完整流程-" + randomUUID().slice(0, 8),
  ids = [],
  directory = resolve(".wrangler/state/v3/d1"),
  file = readdirSync(directory, { recursive: true }).find(
    (f) => f.endsWith(".sqlite") && !f.endsWith("metadata.sqlite"),
  ),
  db = new DatabaseSync(resolve(directory, file));
let checks = 0;
const check = (actual, expected, why) => {
  assert.deepEqual(actual, expected, why);
  checks++;
};
async function request(path, method = "GET", value, auth = true) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      ...(auth ? { Cookie: "__sites_local_auth=1" } : {}),
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: r.status, value: await r.json() };
}
async function create(kind, values = {}) {
  const r = await request("/api/space", "POST", { kind, title: label + "-" + kind, ...values });
  check(r.status, 201, "create " + kind);
  ids.push(r.value.item.id);
  return r.value.item;
}
async function update(r, change) {
  const result = await request("/api/space", "PATCH", { id: r.id, version: r.version, ...change });
  check(result.status, 200, "update");
  return result.value.item;
}
const draft = {
  kind: "note",
  title: label,
  content: "尚未保存的文字",
  tags: "one",
  dueAt: "",
  status: "active",
  meta: {},
  pinned: false,
  favorite: false,
  collectionId: null,
};
const foreign = randomUUID(),
  quotaId = randomUUID(),
  capTitle = label + "-cap";
try {
  for (const path of ["/api/drafts", "/api/tags", "/api/activity", "/api/usage"])
    check((await request(path, "GET", undefined, false)).status, 401, "anonymous " + path);
  const note = await create("note", { tags: [label, "target"] });
  let d = await request("/api/drafts", "PUT", { key: note.id, version: 0, data: draft });
  check(d.status, 200, "create draft");
  check(
    (await request("/api/drafts?key=" + note.id)).value.draft.data.content,
    draft.content,
    "draft roundtrip",
  );
  check(
    (await request("/api/drafts", "PUT", { key: note.id, version: 0, data: draft })).status,
    409,
    "draft stale create",
  );
  check(
    (
      await request("/api/drafts", "PUT", {
        key: note.id,
        version: 1,
        data: { ...draft, content: "更新草稿" },
      })
    ).status,
    200,
    "draft update",
  );
  check(
    (await request("/api/drafts", "DELETE", { key: note.id, version: 1 })).status,
    409,
    "stale delete denied",
  );
  check(
    (await request("/api/drafts", "DELETE", { key: note.id, version: 2 })).status,
    200,
    "delete own draft",
  );
  db.prepare(
    "INSERT INTO records (id,owner,kind,title,content,created_at,updated_at) VALUES (?,'foreign-owner','note',?,'',?,?)",
  ).run(foreign, label, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
  check(
    (await request("/api/drafts", "PUT", { key: foreign, version: 0, data: draft })).status,
    404,
    "foreign draft target denied",
  );
  const foreignKey = "new-journal";
  db.prepare(
    "INSERT INTO drafts (id,owner,key,data,version,updated_at) VALUES (?,'foreign-owner',?,?,1,?)",
  ).run("foreign-owner:" + foreignKey, foreignKey, JSON.stringify(draft), "2026-01-01T00:00:00Z");
  check(
    (await request("/api/drafts?key=" + foreignKey)).value.draft,
    null,
    "foreign drafts hidden",
  );
  let task = await create("task", {
    dueAt: "2026-11-04",
    status: "done",
    meta: {
      stage: "done",
      priority: "high",
      checklist: JSON.stringify([{ id: "a", text: "第一步", done: true }]),
    },
  });
  task = await update(task, { action: "archive" });
  check(task.status, "archived", "archive task");
  task = await update(task, { action: "unarchive" });
  check(task.status, "done", "unarchive preserves completed status");
  check(
    (
      await request(
        `/api/space?kind=task&priority=high&from=2026-11-04&to=2026-11-04&q=${encodeURIComponent(label)}&lite=1`,
      )
    ).value.total,
    1,
    "date and priority filters",
  );
  check(
    (await request(`/api/space?kind=task&undated=1&q=${encodeURIComponent(label)}&lite=1`)).value
      .total,
    0,
    "undated filter",
  );
  check(
    (
      await request("/api/space", "POST", {
        kind: "event",
        title: label,
        dueAt: "2026-11-04",
        meta: { time: "25:00" },
      })
    ).status,
    400,
    "time validation",
  );
  const form = new FormData();
  form.set("kind", "file");
  form.set("file", new File(["附件内容"], "attachment.txt"));
  form.set("parentId", note.id);
  let response = await fetch(origin + "/api/upload", {
      method: "POST",
      headers: { Cookie: "__sites_local_auth=1", Origin: origin },
      body: form,
    }),
    upload = await response.json();
  check(response.status, 201, "attach upload");
  ids.push(upload.item.id);
  let attachment = upload.item;
  check(
    (await request("/api/space?parent=" + note.id + "&lite=1")).value.items[0].id,
    attachment.id,
    "attachment relation query",
  );
  attachment = await update(attachment, { meta: { parentId: "" } });
  check(attachment.meta.parentId, "", "detach");
  check(attachment.meta.key, "local_seedy/" + attachment.id, "file key immutable");
  attachment = await update(attachment, { action: "trash" });
  check(
    (
      await fetch(origin + "/api/files/" + attachment.id, {
        headers: { Cookie: "__sites_local_auth=1" },
      })
    ).status,
    404,
    "trash normal file protected",
  );
  response = await fetch(origin + "/api/files/" + attachment.id + "?backup=1", {
    headers: { Cookie: "__sites_local_auth=1" },
  });
  check(response.status, 200, "backup includes own trash bytes");
  check(await response.text(), "附件内容", "exact attachment bytes");
  const tagResult = await request("/api/tags", "PATCH", { from: label, to: "target" });
  check(tagResult.status, 200, "tag merge");
  const changed = (await request("/api/space?id=" + note.id + "&scope=all&lite=1")).value.items[0];
  check(changed.tags, ["target"], "tag dedupe");
  check(changed.version, note.version + 1, "tag mutation version");
  check(
    (await request("/api/space", "PATCH", { id: note.id, version: note.version, title: "stale" }))
      .status,
    409,
    "tag edit protects stale window",
  );
  await create("expense", {
    dueAt: "2026-11-04",
    meta: { direction: "in", amount: "1.23", category: label },
  });
  await create("expense", {
    dueAt: "2026-11-04",
    meta: { direction: "out", amount: "0.29", category: label },
  });
  const ledger = (await request(`/api/space?kind=expense&q=${encodeURIComponent(label)}`)).value
    .ledger;
  check(ledger.incomeCents, 123, "income cents");
  check(ledger.expenseCents, 29, "expense cents");
  check(ledger.count, 2, "ledger records");
  const lite = (await request("/api/space?lite=1")).value;
  check("stats" in lite, false, "lite omits dashboard queries");
  check(
    (await request("/api/activity?q=" + encodeURIComponent(label))).value.rows.length > 0,
    true,
    "activity search",
  );
  check(
    (await request("/api/activity?history=1")).value.rows.some((r) => r.recordId === note.id),
    true,
    "history archival paging",
  );
  const insertHistory = db.prepare(
    "INSERT INTO revisions (id,owner,record_id,snapshot,created_at) VALUES (?,'local_seedy',?,?,?)",
  );
  for (let i = 0; i < 105; i++)
    insertHistory.run(randomUUID(), note.id, JSON.stringify(note), "2025-01-01T00:00:00.000Z");
  await update(changed, { content: "保留策略验收" });
  check(
    db.prepare("SELECT COUNT(*) AS n FROM revisions WHERE record_id=?").get(note.id).n,
    100,
    "revision retention",
  );
  const existingBytes = db
    .prepare(
      "SELECT COALESCE(SUM(CAST(json_extract(meta,'$.size') AS INTEGER)),0) AS n FROM records WHERE owner='local_seedy' AND kind IN ('file','photo')",
    )
    .get().n;
  db.prepare(
    "INSERT INTO records (id,owner,kind,title,meta,created_at,updated_at) VALUES (?,'local_seedy','file',?,?,?,?)",
  ).run(
    quotaId,
    label,
    JSON.stringify({
      size: 1073741824 - existingBytes,
      key: "local_seedy/" + quotaId,
      filename: "quota-fixture.bin",
    }),
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00Z",
  );
  const small = new FormData();
  small.set("file", new File(["one"], "quota.txt"));
  response = await fetch(origin + "/api/upload", {
    method: "POST",
    headers: { Cookie: "__sites_local_auth=1", Origin: origin },
    body: small,
  });
  check(response.status, 409, "storage quota denied transactionally");
  db.prepare("DELETE FROM records WHERE id=?").run(quotaId);
  const current = db.prepare("SELECT COUNT(*) AS n FROM records WHERE owner='local_seedy'").get().n,
    seed = db.prepare(
      "INSERT INTO records (id,owner,kind,title,created_at,updated_at) VALUES (?,'local_seedy','note',?,?,?)",
    );
  db.exec("BEGIN");
  for (let n = current; n < 10000; n++)
    seed.run(randomUUID(), capTitle, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
  db.exec("COMMIT");
  check(
    (await request("/api/space", "POST", { kind: "note", title: label })).status,
    409,
    "record quota",
  );
  db.prepare("DELETE FROM records WHERE title=?").run(capTitle);
  const usage = await request("/api/usage");
  check(usage.value.maxBytes, 1073741824, "usage cap");
  check(usage.value.maxRecords, 10000, "record cap");
  console.log(
    JSON.stringify({
      status: "passed",
      assertions: checks,
      features: [
        "draft conflicts",
        "attachments",
        "trash byte backup",
        "tag merge",
        "all-page ledger",
        "lite listing",
        "activity",
        "quotas",
        "retention",
      ],
    }),
  );
} finally {
  db.prepare("DELETE FROM records WHERE id IN (?,?) OR title=?").run(foreign, quotaId, capTitle);
  db.prepare("DELETE FROM drafts WHERE owner='foreign-owner' AND key='new-journal'").run();
  for (const id of ids) {
    try {
      const r = await request("/api/space?scope=all&id=" + id + "&lite=1");
      let item = r.value.items[0];
      if (!item)
        item = (await request("/api/space?scope=trash&id=" + id + "&lite=1")).value.items[0];
      if (item && !item.deletedAt)
        item = (
          await request("/api/space", "PATCH", { id, version: item.version, action: "trash" })
        ).value.item;
      if (item) await request("/api/space", "DELETE", { id, version: item.version });
    } catch {}
  }
  db.close();
}
