import { describe, it, expect, vi } from "vitest";
import { loadProjectTasks } from "../app/lib/project-list";
import type { SpaceRecord } from "../app/lib/model";
const rows = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => ({ id: String(from + i) }) as SpaceRecord);
const page = (items: SpaceRecord[], nextCursor: string | null) => ({
  items,
  total: 207,
  nextCursor,
  projectTasks: [{ projectId: "p", total: 207, done: 1 }],
});
describe("project visible pages", () => {
  it("bounds the initial request without estimating whole-project totals", async () => {
    const request = vi.fn(async () => page(rows(0, 200), "next"));
    const result = await loadProjectTasks("p", {}, request);
    expect(result.items).toHaveLength(200);
    expect(result.total).toBe(207);
    expect(result.done).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("uses the actual continuation cursor for older tasks", async () => {
    const request = vi.fn(async (path: string) => {
      expect(path).toContain("/api/space?");
      return page(rows(200, 207), null);
    });
    const result = await loadProjectTasks("p", { cursor: "next" }, request);
    expect(
      new URL(request.mock.calls[0][0], "https://test.invalid").searchParams.get("cursor"),
    ).toBe("next");
    expect(result.items[6].id).toBe("206");
  });
  it("restores all previously opened pages after returning from an editor", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page(rows(0, 200), "next"))
      .mockResolvedValueOnce(page(rows(200, 207), null));
    const result = await loadProjectTasks("p", { limit: 207 }, request);
    expect(result.items).toHaveLength(207);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.nextCursor).toBeNull();
  });
  it("deduplicates overlapping pages during concurrent edits", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page(rows(0, 200), "next"))
      .mockResolvedValueOnce(page(rows(199, 207), null));
    expect((await loadProjectTasks("p", { limit: 207 }, request)).items).toHaveLength(207);
  });
  it("rejects a looping cursor rather than repeatedly loading", async () => {
    await expect(
      loadProjectTasks("p", { cursor: "same" }, async () => page(rows(0, 1), "same")),
    ).rejects.toThrow("已变化");
  });
  it("does not report partial data as a successful refresh", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page(rows(0, 200), "next"))
      .mockRejectedValueOnce(new Error("offline"));
    await expect(loadProjectTasks("p", { limit: 207 }, request)).rejects.toThrow("offline");
  });
  it("encodes project filters without allowing query injection", async () => {
    const request = vi.fn(async (path: string) => {
      expect(path).toContain("/api/space?");
      return page([], null);
    });
    await loadProjectTasks("p&scope=trash", {}, request);
    const p = new URL(request.mock.calls[0][0], "https://test.invalid").searchParams;
    expect(p.get("scope")).toBe("active");
    expect(p.get("project")).toBe("p&scope=trash");
  });
});
