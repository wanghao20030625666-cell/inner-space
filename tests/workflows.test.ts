import { describe, it, expect, vi } from "vitest";
import { completeEditorClose } from "../app/lib/editor-close";
import { defaultPreferences, preferencesInput, type Preferences } from "../app/lib/model";
import {
  normalizePreferences,
  preferencesReducer,
  samePreferences,
  trashCutoff,
} from "../app/lib/preferences";
import { countByKind, countByView, type Count } from "../app/lib/client";
import { spaceCommands, recordSearchPath } from "../app/lib/commands";
import { isDirectWorkerRequest } from "../app/lib/request-host";

describe("explicit editor close choices", () => {
  const actions = () => ({
    flush: vi.fn(async () => true),
    discard: vi.fn(async () => {}),
    close: vi.fn(),
  });
  it("saves before closing only when keep is chosen", async () => {
    const a = actions();
    await completeEditorClose("keep", a);
    expect(a.flush).toHaveBeenCalledOnce();
    expect(a.discard).not.toHaveBeenCalled();
    expect(a.close).toHaveBeenCalledOnce();
  });
  it("leaves unsaved contents open on failed autosave", async () => {
    const a = actions();
    a.flush.mockResolvedValue(false);
    await expect(completeEditorClose("keep", a)).rejects.toThrow("未能保存");
    expect(a.close).not.toHaveBeenCalled();
  });
  it("waits for permanent draft deletion before closing", async () => {
    const a = actions();
    let release!: () => void;
    a.discard.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = completeEditorClose("discard", a);
    expect(a.close).not.toHaveBeenCalled();
    release();
    await pending;
    expect(a.discard).toHaveBeenCalledWith(true);
    expect(a.flush).not.toHaveBeenCalled();
    expect(a.close).toHaveBeenCalledOnce();
  });
  it("does not close on another window's draft delete conflict", async () => {
    const a = actions();
    a.discard.mockRejectedValue(new Error("草稿已变化"));
    await expect(completeEditorClose("discard", a)).rejects.toThrow("已变化");
    expect(a.close).not.toHaveBeenCalled();
  });
  it("continue neither saves nor discards", async () => {
    const a = actions();
    await completeEditorClose("continue", a);
    expect(a.flush).not.toHaveBeenCalled();
    expect(a.discard).not.toHaveBeenCalled();
    expect(a.close).not.toHaveBeenCalled();
  });
});
describe("settings from concurrent windows", () => {
  const initial = () => ({
    base: { ...defaultPreferences },
    form: { ...defaultPreferences },
    remote: { ...defaultPreferences },
  });
  const remote: Preferences = { ...defaultPreferences, name: "别处的名称", theme: "dark" };
  it("normalizes existing preferences with automatic deletion disabled", () => {
    expect(
      normalizePreferences({ name: "旧设置", motto: "", theme: "light", weekStartsMonday: false })
        .trashRetentionDays,
    ).toBe(0);
  });
  it("refreshes an untouched form", () => {
    const result = preferencesReducer(initial(), { type: "receive", value: remote });
    expect(result.form).toEqual(remote);
    expect(result.base).toEqual(remote);
  });
  it("preserves dirty fields and baseline when remote changes", () => {
    const dirty = preferencesReducer(initial(), { type: "edit", value: { motto: "本地未保存" } });
    const result = preferencesReducer(dirty, { type: "receive", value: remote });
    expect(result.form.motto).toBe("本地未保存");
    expect(samePreferences(result.base, result.remote)).toBe(false);
  });
  it("merges only explicitly edited fields onto the latest remote settings", () => {
    const dirty = preferencesReducer(initial(), { type: "edit", value: { motto: "本地未保存" } });
    const result = preferencesReducer(
      preferencesReducer(dirty, { type: "receive", value: remote }),
      { type: "merge" },
    );
    expect(result.form).toEqual({ ...remote, motto: "本地未保存" });
    expect(result.base).toEqual(remote);
  });
  it("explicit reload drops local edits", () => {
    const dirty = preferencesReducer(initial(), { type: "edit", value: { name: "本地" } });
    expect(
      preferencesReducer(preferencesReducer(dirty, { type: "receive", value: remote }), {
        type: "reload",
      }).form,
    ).toEqual(remote);
  });
  it("compares known values independent of key order", () =>
    expect(samePreferences(defaultPreferences, { ...defaultPreferences })).toBe(true));
  it("retention accepts only supported opt-in periods", () => {
    expect(
      preferencesInput.safeParse({ ...defaultPreferences, trashRetentionDays: 1 }).success,
    ).toBe(false);
    expect(trashCutoff(0)).toBeNull();
    expect(trashCutoff(30, new Date("2026-03-01T12:30:00Z"))).toBe("2026-01-30T12:30:00.000Z");
  });
});
describe("navigation and scoped counts", () => {
  const counts: Count[] = [
    { kind: "note", status: "active", favorite: 0, deleted: 0, count: 3 },
    { kind: "note", status: "active", favorite: 1, deleted: 0, count: 2 },
    { kind: "note", status: "archived", favorite: 1, deleted: 0, count: 7 },
    { kind: "task", status: "done", favorite: 0, deleted: 0, count: 5 },
    { kind: "note", status: "active", favorite: 1, deleted: 1, count: 11 },
  ];
  it("shares active counts across the dashboard and sidebar", () => {
    expect(countByKind(counts, "note")).toBe(5);
    expect(countByView(counts, "note")).toBe(5);
    expect(countByKind(counts, "task", "active")).toBe(0);
  });
  it("keeps favorites, archive and trash mutually scoped", () => {
    expect(countByView(counts, "favorites")).toBe(2);
    expect(countByView(counts, "archive")).toBe(7);
    expect(countByView(counts, "trash")).toBe(11);
  });
  it("filters creation and navigation commands", () => {
    expect(spaceCommands("新建笔记", []).map((c) => c.id)).toEqual(["create-note"]);
    expect(spaceCommands("前往账本", [])[0]?.action).toBe("navigate");
  });
  it("encodes record searches as active lite queries", () => {
    const url = new URL(recordSearchPath("a&scope=trash"), "https://test.invalid");
    expect(url.searchParams.get("scope")).toBe("active");
    expect(url.searchParams.get("q")).toBe("a&scope=trash");
    expect(url.searchParams.get("lite")).toBe("1");
  });
});
describe("direct Worker hosts", () => {
  it.each([
    "https://foo.account.workers.dev/api/space",
    "https://branch.foo.account.workers.dev/api/space",
    "https://foo.workers.dev.:443/",
  ])("rejects direct URL %s", (url) => expect(isDirectWorkerRequest(url, null)).toBe(true));
  it("checks Host independently of URL", () =>
    expect(
      isDirectWorkerRequest("https://example.chatgpt.site/", "app.account.workers.dev:443"),
    ).toBe(true));
  it("keeps Sites domains and local development available", () => {
    expect(
      isDirectWorkerRequest("https://inner-space-xinde.xinghujie0625.chatgpt.site/", null),
    ).toBe(false);
    expect(isDirectWorkerRequest("http://127.0.0.1:5181/", "127.0.0.1:5181")).toBe(false);
  });
  it("does not mistake a suffix lookalike for a Worker host", () =>
    expect(isDirectWorkerRequest("https://workers.dev.example.org/", null)).toBe(false));
});
