import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:5181",
  owner = "local_seedy",
  label = "daily-" + randomUUID().slice(0, 8),
  ids = [],
  foreign = "daily-other";
const dir = resolve(".wrangler/state/v3/d1"),
  file = readdirSync(dir, { recursive: true }).find(
    (f) => f.endsWith(".sqlite") && !f.endsWith("metadata.sqlite"),
  ),
  db = new DatabaseSync(resolve(dir, file));
const headers = {
  Cookie: "__sites_local_auth=1",
  Origin: base,
  "Content-Type": "application/json",
};
let assertions = 0,
  draftKey;
const check = (value, expected, message) => {
  assert.deepEqual(value, expected, message);
  assertions++;
};
async function request(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, value: await r.json() };
}
async function create(kind, meta = {}, dueAt = null) {
  const r = await request("/api/space", "POST", { kind, title: label, meta, dueAt });
  check(r.status, 201, "create " + kind);
  ids.push(r.value.item.id);
  return r.value.item;
}
try {
  const captureLanding = await fetch(base + "/capture");
  check(captureLanding.status, 200, "public capture handoff is reachable without identity");
  check(
    (await captureLanding.text()).includes("登录后继续"),
    true,
    "anonymous capture contains no account records",
  );
  db.exec("BEGIN");
  const insert = db.prepare(
    "INSERT INTO records(id,owner,kind,title,meta,status,deleted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'2026-12-31T00:00:00Z','2026-12-31T00:00:00Z')",
  );
  for (let i = 0; i < 205; i++) {
    const id = randomUUID();
    ids.push(id);
    insert.run(id, owner, "contact", label, "{}", "active", null);
  }
  for (const [who, status, deleted] of [
    [foreign, "active", null],
    [owner, "archived", null],
    [owner, "active", "2026-11-04"],
  ]) {
    const id = randomUUID();
    ids.push(id);
    insert.run(id, who, "contact", label, JSON.stringify({ birthday: "12-31" }), status, deleted);
  }
  db.exec("COMMIT");
  const birthday = await create("contact", { birthday: "12-31" }),
    next = await create("contact", { birthday: "01-01" }),
    leap = await create("contact", { birthday: "02-29" }),
    countdown = await create("event", { reminderType: "countdown" }, "2027-01-02"),
    renewal = await create("event", { reminderType: "subscription" }, "2026-12-30");
  let r = await request("/api/space?today=2026-12-31");
  const own = r.value.reminders.filter((x) => x.title === label);
  check(
    own.map((x) => x.id).sort(),
    [birthday.id, next.id, leap.id, countdown.id, renewal.id].sort(),
    "reminders independent of first 200 and owner/status scope",
  );
  check(own.find((x) => x.id === birthday.id).days, 0, "birthday today");
  check(own.find((x) => x.id === next.id).days, 1, "new-year roll");
  check(own.find((x) => x.id === leap.id).date, "2027-02-28", "leap-day rule");
  check(own.find((x) => x.id === renewal.id).days, -1, "overdue renewal");
  r = await request("/api/space?lite=1");
  check("reminders" in r.value, false, "lite stays light");
  check(
    (
      await request("/api/space", "POST", {
        kind: "contact",
        title: label,
        meta: { birthday: "02-30" },
      })
    ).status,
    400,
    "invalid birthday",
  );
  check(
    (
      await request("/api/space", "POST", {
        kind: "event",
        title: label,
        dueAt: "2027-01-02",
        meta: { reminderType: "auto-pay" },
      })
    ).status,
    400,
    "unknown reminder type",
  );
  check(
    (
      await request("/api/space", "PATCH", {
        id: birthday.id,
        version: 1,
        meta: { birthday: "13-01" },
      })
    ).status,
    400,
    "patch validation",
  );
  draftKey = "new-note-" + randomUUID();
  const data = {
    baseVersion: 0,
    kind: "note",
    title: label,
    content: "快捷记录仍需正式保存",
    tags: "",
    dueAt: "",
    status: "active",
    meta: {},
    favorite: false,
    pinned: false,
    collectionId: null,
  };
  r = await request("/api/drafts", "PUT", { key: draftKey, version: 0, data });
  check(r.status, 200, "independent capture draft");
  check(
    (await request("/api/drafts?key=" + draftKey)).value.draft.data.content,
    data.content,
    "capture draft can recover",
  );
  check(
    (await request("/api/drafts", "PUT", { key: "new-note-unsafe", version: 0, data })).status,
    400,
    "invalid capture draft key",
  );
  check(
    (await request("/api/drafts", "DELETE", { key: draftKey, version: 1 })).status,
    200,
    "discard capture draft",
  );
  const form = new FormData();
  form.set("kind", "photo");
  form.set(
    "file",
    new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSf8AAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      label + ".png",
      { type: "image/png" },
    ),
  );
  const response = await fetch(base + "/api/upload", {
      method: "POST",
      headers: { Cookie: "__sites_local_auth=1", Origin: base },
      body: form,
    }),
    uploaded = await response.json();
  check(response.status, 201, "photo paste transport");
  ids.push(uploaded.item.id);
  const note = await create("note");
  r = await request("/api/space", "PATCH", {
    id: note.id,
    version: note.version,
    content: `![截图](/api/files/${uploaded.item.id})`,
  });
  check(r.status, 200, "save protected image reference");
  const image = await fetch(base + "/api/files/" + uploaded.item.id, {
    headers: { Cookie: "__sites_local_auth=1" },
  });
  check(image.status, 200, "owner image download");
  check(image.headers.get("content-type"), "image/png", "signature-checked MIME");
  check(
    image.headers.get("content-disposition").startsWith("inline"),
    true,
    "inline image disposition",
  );
  const anonymous = await fetch(base + "/api/files/" + uploaded.item.id);
  check(anonymous.status, 401, "private image remains protected");
  console.log(
    JSON.stringify({
      ok: true,
      assertions,
      features: [
        "birthday/calendar boundaries",
        "owner reminders beyond first page",
        "independent capture drafts",
        "inline photo bytes and ownership",
      ],
    }),
  );
} finally {
  if (draftKey) db.prepare("DELETE FROM drafts WHERE owner=? AND key=?").run(owner, draftKey);
  for (const id of ids) {
    const r = await request("/api/space?id=" + id + "&scope=all&lite=1").catch(() => null);
    let item = r?.value.items?.[0];
    if (item && ["photo", "file"].includes(item.kind)) {
      item = (await request("/api/space", "PATCH", { id, version: item.version, action: "trash" }))
        .value.item;
      await request("/api/space", "DELETE", { id, version: item.version });
    }
    db.prepare("DELETE FROM records WHERE id=? AND owner IN (?,?)").run(id, owner, foreign);
    db.prepare("DELETE FROM revisions WHERE record_id=? AND owner IN (?,?)").run(
      id,
      owner,
      foreign,
    );
    db.prepare("DELETE FROM audit WHERE record_id=? AND owner IN (?,?)").run(id, owner, foreign);
  }
  db.close();
}
