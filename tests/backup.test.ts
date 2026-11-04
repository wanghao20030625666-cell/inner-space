import { describe, it, expect, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
import { buildBackup, readBackup } from "../app/lib/backup";
const record = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "file",
  title: "hello.txt",
  content: "",
  tags: [],
  meta: { size: 5, filename: "hello.txt" },
  favorite: false,
  pinned: false,
  collectionId: null,
  status: "active",
  dueAt: null,
  createdAt: "2026-11-04T00:00:00Z",
  updatedAt: "2026-11-04T00:00:00Z",
  version: 1,
  deletedAt: null,
};
const bytes = strToU8("hello"),
  sha256 = createHash("sha256").update(bytes).digest("hex");
const backup = (hash = sha256) => ({
  format: "inner-space-v3",
  records: [record],
  collections: [],
  files: { [record.id]: { path: "files/sample", sha256: hash } },
});
describe("collection backup boundaries", () => {
  it("builds a hashed attachment archive without exporting account settings or other collections", async () => {
    const collection = {
      id: "00000000-0000-4000-8000-000000000010",
      name: "专题/测试",
      color: "green",
      createdAt: "2026-01-01",
      count: 1,
    };
    const requests: string[] = [];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      requests.push(path);
      if (path.startsWith("/api/files/")) return new Response(new Uint8Array(bytes).buffer);
      const p = new URL(path, "https://test.invalid");
      if (p.pathname === "/api/space") {
        expect(p.searchParams.get("collection")).toBe(collection.id);
        expect(p.searchParams.get("includeAttachments")).toBe("1");
        return Response.json({
          items: p.searchParams.get("scope") === "trash" ? [] : [record],
          nextCursor: null,
        });
      }
      expect(p.searchParams.get("collection")).toBe(collection.id);
      return Response.json({ rows: [], nextCursor: null });
    });
    try {
      const result = await buildBackup(true, () => {}, collection);
      const prepared = await readBackup(new File([result.value], result.filename));
      expect(prepared.backup.records.map((r) => r.id)).toEqual([record.id]);
      expect(prepared.backup.collections?.map((c) => c.id)).toEqual([collection.id]);
      expect(prepared.backup.preferences).toBeUndefined();
      expect(prepared.entries[`files/${record.id}`]).toEqual(bytes);
      expect(requests).not.toContain("/api/space");
      expect(result.filename).not.toContain("专题/测试");
    } finally {
      fetch.mockRestore();
    }
  });
});
const file = (value: unknown, attachment = bytes) =>
  new File(
    [
      new Uint8Array(
        zipSync({ "backup.json": strToU8(JSON.stringify(value)), "files/sample": attachment }),
      ).buffer,
    ],
    "backup.zip",
  );
describe("backup validation before writes", () => {
  it("reads valid archive and verifies SHA-256", async () => {
    const r = await readBackup(file(backup()));
    expect(r.backup.records).toHaveLength(1);
    expect(r.entries["files/sample"]).toEqual(bytes);
  });
  it("rejects changed attachment bytes", async () => {
    await expect(readBackup(file(backup(), strToU8("other")))).rejects.toThrow("校验失败");
  });
  it("rejects a missing manifest", async () => {
    const input = new File([new Uint8Array(zipSync({ "other.json": bytes })).buffer], "bad.zip");
    await expect(readBackup(input)).rejects.toThrow("缺少 backup.json");
  });
  it("rejects invalid records without a request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(
      readBackup(file({ ...backup(), records: [{ ...record, title: "" }] })),
    ).rejects.toThrow("格式无效");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("rejects duplicate record IDs", async () => {
    await expect(readBackup(file({ ...backup(), records: [record, record] }))).rejects.toThrow(
      "重复",
    );
  });
  it("rejects duplicate collection IDs", async () => {
    const collection = { id: "one", name: "Group", color: "green" };
    await expect(
      readBackup(file({ ...backup(), collections: [collection, collection] })),
    ).rejects.toThrow("专题数据无效");
  });
  it("accepts older text-only backups", async () => {
    const input = new File(
      [JSON.stringify({ format: "inner-space-v1", records: [{ ...record, kind: "note" }] })],
      "old.json",
    );
    expect((await readBackup(input)).backup.format).toBe("inner-space-v1");
  });
  it("rejects inflated entries before extraction", async () => {
    const archive = zipSync({
      "backup.json": strToU8(JSON.stringify(backup())),
      bomb: new Uint8Array(27 * 1024 * 1024),
    });
    await expect(
      readBackup(new File([new Uint8Array(archive).buffer], "large.zip")),
    ).rejects.toThrow("ZIP 解压内容超过限制");
  });
});
