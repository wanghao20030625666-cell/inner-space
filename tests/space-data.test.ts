import { describe, it, expect } from "vitest";
import {
  spaceParams,
  canPatchRecord,
  patchRecordData,
  type SpaceFilters,
} from "../app/lib/space-data";
import { initialData } from "../app/lib/client";
import type { SpaceRecord } from "../app/lib/model";
import { monthlySeries } from "../app/lib/ledger-trend";
import { workspaceUiReducer, initialWorkspaceUi } from "../app/hooks/use-workspace-ui";
const filters: SpaceFilters = {
  view: "note",
  search: "",
  collectionId: "",
  tag: "",
  status: "all",
  reading: "all",
  month: "",
  sort: "updated",
  priority: "",
  deadline: "",
  fileType: "",
  kindFilter: "",
  today: "2026-11-04",
};
const record = {
  id: "a",
  kind: "note",
  title: "before",
  content: "",
  tags: [],
  meta: {},
  favorite: false,
  pinned: false,
  collectionId: null,
  status: "active",
  dueAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  version: 1,
  deletedAt: null,
} as SpaceRecord;
describe("conservative local edits", () => {
  it("allows plain content edits in an unfiltered module", () =>
    expect(
      canPatchRecord(spaceParams(filters), record, { ...record, content: "after" }, null),
    ).toBe(true));
  it.each([
    { favorite: true },
    { pinned: true },
    { status: "done" },
    { collectionId: "new" },
    { dueAt: "2026-11-05" },
    { deletedAt: "2026-11-04" },
  ])("refreshes aggregate-affecting fields %j", (changes) =>
    expect(
      canPatchRecord(spaceParams(filters), record, { ...record, ...changes } as SpaceRecord, null),
    ).toBe(false),
  );
  it("does not estimate searched membership", () =>
    expect(
      canPatchRecord(
        spaceParams({ ...filters, search: "before" }),
        record,
        { ...record, title: "after" },
        null,
      ),
    ).toBe(false));
  it("refreshes dashboard projections from the server", () =>
    expect(
      canPatchRecord(
        spaceParams({ ...filters, view: "overview" }),
        record,
        { ...record, content: "after" },
        null,
      ),
    ).toBe(false));
  it("refreshes money changes", () => {
    const value = { ...record, kind: "expense", meta: { amount: "1" } } as SpaceRecord;
    expect(
      canPatchRecord(
        spaceParams({ ...filters, view: "expense" }),
        value,
        { ...value, meta: { amount: "2" } },
        null,
      ),
    ).toBe(false);
  });
  it("patches known rows without losing other metadata", () => {
    const result = patchRecordData(
      { ...initialData, items: [record], recent: [record], total: 99 },
      { ...record, content: "saved", version: 2 },
    );
    expect(result.items[0].version).toBe(2);
    expect(result.recent[0].content).toBe("saved");
    expect(result.total).toBe(99);
  });
  it("constructs a seven-day range from local calendar dates", () => {
    const params = spaceParams({ ...filters, view: "task", today: "2026-12-29", deadline: "week" });
    expect(params.get("from")).toBe("2026-12-29");
    expect(params.get("to")).toBe("2027-01-04");
    expect(params.get("status")).toBe("active");
  });
});
describe("trend and UI state", () => {
  it("fills missing months across year boundaries", () => {
    const result = monthlySeries(
      [{ month: "2026-12", incomeCents: 101, expenseCents: 0 }],
      "2027-02",
      3,
    );
    expect(result.map((r) => r.month)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(result[1].incomeCents).toBe(0);
    expect(result[0].incomeCents).toBe(101);
  });
  it("rejects malformed chart ranges", () => expect(() => monthlySeries([], "2026-13")).toThrow());
  it("updates selection and preserves other modal state", () => {
    const selected = workspaceUiReducer(
      { ...initialWorkspaceUi, chooser: true },
      { key: "selected", value: ["a"] },
    );
    expect(selected.chooser).toBe(true);
    const result = workspaceUiReducer(selected, {
      key: "selected",
      value: (before: string[]) => [...before, "b"],
    });
    expect(result.selected).toEqual(["a", "b"]);
    expect(initialWorkspaceUi.selected).toEqual([]);
  });
});
