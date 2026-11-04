import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:5181",
  label = "review4-" + randomUUID().slice(0, 8),
  headers = { Cookie: "__sites_local_auth=1", Origin: base, "Content-Type": "application/json" },
  dir = resolve(".wrangler/state/v3/d1"),
  file = readdirSync(dir, { recursive: true }).find(
    (f) => f.endsWith(".sqlite") && !f.endsWith("metadata.sqlite"),
  ),
  db = new DatabaseSync(resolve(dir, file));
let assertions = 0,
  oldPreferences;
function check(value, expected, why) {
  assert.deepEqual(value, expected, why);
  assertions++;
}
async function request(path, method = "GET", value) {
  const response = await fetch(base + path, {
    method,
    headers,
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, value: await response.json() };
}
try {
  const insert = db.prepare(
    "INSERT INTO records(id,owner,kind,title,tags,meta,due_at,created_at,updated_at,status,deleted_at) VALUES(?,?,?,?,?,'{}',?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',?,?)",
  );
  const samples = [
    { owner: "local_seedy", date: "2025-11-04", status: "active", deleted: null },
    { owner: "local_seedy", date: "2024-11-04", status: "active", deleted: null },
    { owner: "local_seedy", date: "2026-11-04", status: "active", deleted: null },
    { owner: "local_seedy", date: "2025-11-05", status: "active", deleted: null },
    { owner: "local_seedy", date: "2025-11-04", status: "archived", deleted: null },
    { owner: "local_seedy", date: "2025-11-04", status: "active", deleted: "2026-01-01" },
    { owner: "foreign-review4", date: "2025-11-04", status: "active", deleted: null },
  ];
  db.exec("BEGIN");
  for (const r of samples)
    insert.run(randomUUID(), r.owner, "journal", label, "[]", r.date, r.status, r.deleted);
  for (let i = 0; i < 125; i++)
    insert.run(
      randomUUID(),
      "local_seedy",
      "note",
      label,
      JSON.stringify([label]),
      null,
      "active",
      null,
    );
  db.exec("COMMIT");
  let result = await request("/api/space?today=2026-11-04");
  check(result.status, 200, "dashboard");
  const memories = result.value.onThisDay.filter((r) => r.title === label);
  check(
    memories.map((r) => r.dueAt),
    ["2025-11-04", "2024-11-04"],
    "past same day, owner and active scope",
  );
  check(memories.length, 2, "exclude today, other date, archive, trash and foreign");
  result = await request("/api/space?today=2026-13-99");
  check(result.status, 200, "invalid date hint falls back");
  const target = label + "-merged",
    first = await request("/api/tags", "PATCH", { from: label, to: target });
  check(first.status, 200, "first tag batch");
  check(first.value.changed, 50, "fifty per batch");
  check(first.value.remaining, 75, "remaining exact");
  const second = await request("/api/tags", "PATCH", { from: label, to: target });
  check(second.value.changed, 50, "second fifty");
  check(second.value.remaining, 25, "remaining twenty five");
  const last = await request("/api/tags", "PATCH", { from: label, to: target });
  check(last.value.changed, 25, "last batch");
  check(last.value.remaining, 0, "fully merged");
  const rows = db
    .prepare(
      "SELECT id,version,tags FROM records WHERE owner='local_seedy' AND kind='note' AND title=?",
    )
    .all(label);
  check(
    rows.every((r) => r.version === 2),
    true,
    "versions increment once",
  );
  check(
    rows.every((r) => JSON.parse(r.tags)[0] === target),
    true,
    "all tags merged",
  );
  check(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM revisions WHERE record_id IN (SELECT id FROM records WHERE title=?)",
      )
      .get(label).n,
    125,
    "all snapshots retained",
  );
  oldPreferences = (await request("/api/space")).value.preferences;
  check(
    (await request("/api/preferences", "PUT", { ...oldPreferences, theme: "dark" })).status,
    200,
    "set dark preview",
  );
  const html = await (await fetch(base + "/", { headers })).text();
  check(html.includes('data-theme="dark"'), true, "root theme server rendered");
  check(html.includes('class="workspace dark"'), true, "workspace server rendered same theme");
  console.log(
    JSON.stringify({
      status: "passed",
      assertions,
      features: [
        "on this day scope",
        "50 record tag batches",
        "tag history and versions",
        "SSR root theme",
      ],
    }),
  );
} finally {
  if (oldPreferences) await request("/api/preferences", "PUT", oldPreferences);
  db.prepare("DELETE FROM revisions WHERE record_id IN (SELECT id FROM records WHERE title=?)").run(
    label,
  );
  db.prepare("DELETE FROM records WHERE title=?").run(label);
  db.prepare("DELETE FROM audit WHERE owner='local_seedy' AND title LIKE ?").run(label + "%");
  db.close();
}
