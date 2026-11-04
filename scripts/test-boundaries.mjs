import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const directory = resolve(".wrangler/state/v3/d1"),
  file = readdirSync(directory, { recursive: true }).find(
    (p) => p.endsWith(".sqlite") && !p.endsWith("metadata.sqlite"),
  );
if (!file) throw new Error("Local D1 not initialized");
const db = new DatabaseSync(resolve(directory, file)),
  origin = "http://127.0.0.1:5181",
  label = "boundary-" + randomUUID(),
  foreignId = randomUUID(),
  foreignProject = randomUUID(),
  foreignCollection = randomUUID(),
  ids = Array.from({ length: 205 }, () => randomUUID());
let assertions = 0;
const check = (value, message) => {
  assert.ok(value, message);
  assertions++;
};
async function request(path, method = "GET", value) {
  const response = await fetch(origin + path, {
    method,
    headers: { Cookie: "__sites_local_auth=1", Origin: origin, "Content-Type": "application/json" },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, value: await response.json() };
}
try {
  const insert = db.prepare(
    "INSERT INTO records (id,owner,kind,title,content,tags,meta,created_at,updated_at) VALUES (?, ?, ?, ?, '', '[]', '{}', ?, ?)",
  );
  db.exec("BEGIN");
  for (const [id, owner, kind] of [
    [foreignId, "foreign-owner", "note"],
    [foreignProject, "foreign-owner", "project"],
    ...ids.map((id) => [id, "local_seedy", "note"]),
  ])
    insert.run(id, owner, kind, label, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  const pin = db.prepare("UPDATE records SET pinned=1 WHERE id=?");
  for (const id of ids.slice(0, 201)) pin.run(id);
  const tag = db.prepare("UPDATE records SET tags=? WHERE id=?");
  for (const id of ids.slice(201)) tag.run(JSON.stringify([label, "last-page"]), id);
  db.prepare("INSERT INTO collections (id,owner,name,created_at) VALUES (?,?,?,?)").run(
    foreignCollection,
    "foreign-owner",
    label,
    "2026-01-01T00:00:00Z",
  );
  db.exec("COMMIT");
  const first = await request("/api/space?q=" + label);
  check(first.status === 200 && first.value.items.length === 200, "first page");
  check(!first.value.items.some((r) => r.id === foreignId), "foreign records hidden");
  check(!first.value.collections.some((r) => r.id === foreignCollection), "foreign groups hidden");
  const second = await request(
    "/api/space?q=" + label + "&cursor=" + encodeURIComponent(first.value.nextCursor),
  );
  check(second.value.items.length === 5 && !second.value.nextCursor, "last page");
  check(
    new Set([...first.value.items, ...second.value.items].map((r) => r.id)).size === 205,
    "no duplicate or gap",
  );
  check(
    first.value.items.every((r) => r.pinned) &&
      second.value.items.filter((r) => r.pinned).length === 1,
    "pinned boundary",
  );
  const tagged = await request("/api/space?q=" + label + "&tag=last-page&lite=1");
  check(tagged.value.total === 4 && tagged.value.items.length === 4, "off-page server tag filter");
  for (const path of [
    "/api/versions?id=" + foreignId,
    "/api/files/" + foreignId,
    "/api/files/" + foreignId + "?backup=1",
  ])
    check((await request(path)).status === 404, "foreign reads denied");
  for (const method of ["PATCH", "DELETE"])
    check(
      (await request("/api/space", method, { id: foreignId, version: 1, title: "forbidden" }))
        .status === 404,
      "foreign writes denied",
    );
  check(
    (await request("/api/space", "POST", { kind: "event", title: label, dueAt: "2026-02-31" }))
      .status === 400,
    "date rejected",
  );
  check(
    (await request("/api/space?collection=" + foreignCollection)).value.total === 0,
    "foreign collection read empty",
  );
  for (const method of ["PATCH", "DELETE"])
    check(
      (
        await request("/api/collections", method, {
          id: foreignCollection,
          name: "forbidden",
          color: "green",
        })
      ).status === 404,
      "foreign collection writes denied",
    );
  check(
    (
      await request("/api/space", "POST", {
        kind: "note",
        title: label,
        collectionId: foreignCollection,
      })
    ).status === 400,
    "foreign collection relation rejected",
  );
  check(
    (
      await request("/api/space", "PATCH", {
        id: ids[0],
        version: 1,
        collectionId: foreignCollection,
      })
    ).status === 400,
    "foreign relation update rejected",
  );
  check(
    (
      await request("/api/space", "POST", {
        kind: "task",
        title: label,
        meta: { projectId: foreignProject },
      })
    ).status === 400,
    "foreign project relation rejected",
  );
  const titles = await request("/api/space?q=" + label + "&sort=title&lite=1"),
    titleNext = await request(
      "/api/space?q=" +
        label +
        "&sort=title&lite=1&cursor=" +
        encodeURIComponent(titles.value.nextCursor),
    );
  check(
    new Set([...titles.value.items, ...titleNext.value.items].map((r) => r.id)).size === 205,
    "ascending sort cursor no gaps",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      assertions,
      paginationRecords: 205,
      mixedPinnedCursor: true,
      ownerIsolation: true,
      collectionAndProjectIsolation: true,
    }),
  );
} finally {
  db.prepare("DELETE FROM records WHERE title=?").run(label);
  db.prepare("DELETE FROM collections WHERE id=?").run(foreignCollection);
  db.close();
}
