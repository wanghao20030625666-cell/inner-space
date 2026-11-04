import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// These integration checks run only against the checkout's loopback dev server.
const origin = process.env.SPACE_TEST_URL || "http://127.0.0.1:5181";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error("Tests require a local preview");
const run = `API验收-${randomUUID().slice(0, 8)}`,
  created = [];
let checks = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Local auth cookie missing");
async function req(path, method = "GET", payload, options = {}) {
  const headers = {
    ...(options.anonymous ? {} : { Cookie: cookie }),
    Origin: options.origin || origin,
  };
  if (!(payload instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body:
      payload === undefined
        ? undefined
        : payload instanceof FormData
          ? payload
          : JSON.stringify(payload),
  });
  const value = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { status: response.status, value, headers: response.headers };
}
async function add(kind, more = {}) {
  const result = await req("/api/space", "POST", {
    kind,
    title: `${run}-${kind}`,
    content: "# 验收内容\n权限与持久化测试",
    tags: [run],
    ...more,
  });
  check(result.status, 201, `create ${kind}`);
  created.push(result.value.item);
  return result.value.item;
}
async function patch(item, data) {
  const result = await req("/api/space", "PATCH", { id: item.id, version: item.version, ...data });
  check(result.status, 200, "update");
  return result.value.item;
}
try {
  for (const path of ["/api/space", "/api/versions?id=unknown", "/api/files/unknown"])
    check(
      (await req(path, "GET", undefined, { anonymous: true })).status,
      401,
      `anonymous ${path}`,
    );
  for (const [path, method] of [
    ["/api/space", "POST"],
    ["/api/space", "PATCH"],
    ["/api/space", "DELETE"],
    ["/api/preferences", "PUT"],
    ["/api/upload", "POST"],
    ["/api/cleanup", "POST"],
  ])
    check((await req(path, method, {}, { anonymous: true })).status, 401, `anonymous ${method}`);
  check(
    (
      await req(
        "/api/space",
        "POST",
        { kind: "note", title: "cross origin" },
        { origin: "https://untrusted.test" },
      )
    ).status,
    403,
    "cross-origin writes blocked",
  );
  for (const invalid of [
    null,
    {},
    { kind: "unknown", title: "x" },
    { kind: "note", title: " " },
    { kind: "bookmark", title: "x", meta: { url: "javascript:alert(1)" } },
    { kind: "event", title: "x" },
    { kind: "expense", title: "x", dueAt: "2026-11-04", meta: { amount: -2, direction: "out" } },
    { kind: "expense", title: "x", dueAt: "2026-11-04", meta: { amount: 1.123, direction: "out" } },
  ])
    check((await req("/api/space", "POST", invalid)).status, 400, "invalid payload rejected");
  check((await req("/api/space?cursor=not-json")).status, 400, "invalid cursor");
  check((await req("/api/space", "PATCH", null)).status, 400, "invalid patch");
  check((await req("/api/space", "DELETE", null)).status, 400, "invalid delete");
  check(
    (await req("/api/space", "POST", { kind: "file", title: "unbacked file" })).status,
    400,
    "cannot forge a file record",
  );
  let note = await add("note", { favorite: true });
  const old = note;
  note = await patch(note, { content: "第二个版本", title: `${run}-更新后的笔记` });
  check(note.version, 2, "version increment");
  check(
    (await req("/api/space", "PATCH", { id: old.id, version: old.version, title: "过期写入" }))
      .status,
    409,
    "stale write conflict",
  );
  const versions = await req(`/api/versions?id=${note.id}`);
  check(versions.value.versions[0].item.content, old.content, "previous content preserved");
  const searched = await req(`/api/space?q=${encodeURIComponent(run)}`);
  check(
    searched.value.items.some((r) => r.id === note.id),
    true,
    "server search",
  );
  check(searched.headers.get("cache-control"), "private, no-store", "private cache policy");
  const favorites = await req("/api/space?scope=favorites");
  check(
    favorites.value.items.some((r) => r.id === note.id),
    true,
    "favorites",
  );
  note = await patch(note, { status: "archived" });
  check(
    (await req("/api/space?scope=archive")).value.items.some((r) => r.id === note.id),
    true,
    "archive",
  );
  note = await patch(note, { status: "active" });
  check(
    (await req("/api/space", "DELETE", { id: note.id, version: note.version })).status,
    400,
    "live records cannot be purged",
  );
  note = await patch(note, { action: "trash" });
  check(
    (await req(`/api/space?q=${encodeURIComponent(run)}`)).value.items.some(
      (r) => r.id === note.id,
    ),
    false,
    "trash hidden from normal search",
  );
  check(
    (await req("/api/space?scope=trash")).value.items.some((r) => r.id === note.id),
    true,
    "trash visible",
  );
  note = await patch(note, { action: "restore" });
  check(note.deletedAt, null, "restore");
  for (const kind of [
    "inbox",
    "journal",
    "task",
    "project",
    "event",
    "bookmark",
    "expense",
    "contact",
  ]) {
    const r = await add(kind, {
      dueAt: "2026-11-04",
      meta:
        kind === "bookmark"
          ? { url: "https://example.com/" }
          : kind === "expense"
            ? { direction: "out", amount: "19.90", category: "验收" }
            : {},
    });
    check(
      (await req(`/api/space?kind=${kind}&q=${encodeURIComponent(run)}`)).value.items.some(
        (i) => i.id === r.id,
      ),
      true,
      `read ${kind}`,
    );
  }
  const form = new FormData();
  form.set("kind", "file");
  form.set("file", new File([`${run}\nfile content`], `${run}.txt`, { type: "text/plain" }));
  const uploaded = await req("/api/upload", "POST", form);
  check(uploaded.status, 201, "file upload");
  created.push(uploaded.value.item);
  const file = await req(`/api/files/${uploaded.value.item.id}`);
  check(file.value, `${run}\nfile content`, "file bytes");
  check(
    file.headers.get("content-disposition").startsWith("attachment;"),
    true,
    "files download as attachments",
  );
  const image = new FormData();
  image.set("kind", "photo");
  image.set(
    "file",
    new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      `${run}.png`,
      { type: "image/png" },
    ),
  );
  const photo = await req("/api/upload", "POST", image);
  check(photo.status, 201, "photo upload");
  created.push(photo.value.item);
  const photoRes = await fetch(`${origin}/api/files/${photo.value.item.id}`, {
    headers: { Cookie: cookie },
  });
  check(photoRes.headers.get("content-type"), "image/png", "photo MIME");
  check(
    photoRes.headers.get("content-disposition").startsWith("inline;"),
    true,
    "safe raster inline",
  );
  const svg = new FormData();
  svg.set("kind", "photo");
  svg.set("file", new File(["<svg onload='alert(1)'></svg>"], "unsafe.svg", { type: "image/png" }));
  check((await req("/api/upload", "POST", svg)).status, 400, "image signature validated");
  const other = await req(`/api/files/${randomUUID()}`);
  check(other.status, 404, "unknown file denied");
  const preferences = (await req("/api/space")).value.preferences;
  try {
    const p = { ...preferences, name: "API 验收空间", theme: "dark" };
    check((await req("/api/preferences", "PUT", p)).status, 200, "save preferences");
    check((await req("/api/space")).value.preferences.name, p.name, "preferences persist");
  } finally {
    await req("/api/preferences", "PUT", preferences);
  }
  const all = (await req(`/api/space?q=${encodeURIComponent(run)}`)).value;
  check(
    all.activity.some((a) => a.title.includes(run)),
    true,
    "activity persists",
  );
  console.log(JSON.stringify({ status: "passed", assertions: checks, modules: 11, label: run }));
} finally {
  for (const record of created) {
    const versions = await req(`/api/versions?id=${record.id}`);
    if (versions.status === 404) continue;
    let r = (await req(`/api/space?q=${encodeURIComponent(run)}&scope=all`)).value.items.find(
      (x) => x.id === record.id,
    );
    if (!r) r = (await req("/api/space?scope=trash")).value.items.find((x) => x.id === record.id);
    if (!r) continue;
    if (!r.deletedAt)
      r = (await req("/api/space", "PATCH", { id: r.id, version: r.version, action: "trash" }))
        .value.item;
    const result = await req("/api/space", "DELETE", { id: r.id, version: r.version });
    assert.equal(result.status, 200, "test fixture cleanup");
    assert.equal((await req(`/api/files/${r.id}`)).status, 404, "removed objects cannot be read");
  }
}
