import { describe, it, expect } from "vitest";
import { recordInput } from "../app/lib/model";
import { recordQuery } from "../app/lib/query";
import { csvCell, ical, vcard, ledgerCSV } from "../app/lib/exports";
import type { SpaceRecord } from "../app/lib/model";
const record = (values: Partial<SpaceRecord> = {}): SpaceRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  kind: "note",
  title: "测试",
  content: "正文",
  tags: [],
  meta: {},
  favorite: false,
  pinned: false,
  collectionId: null,
  status: "active",
  dueAt: null,
  createdAt: "2026-11-04T00:00:00.000Z",
  updatedAt: "2026-11-04T00:00:00.000Z",
  deletedAt: null,
  version: 1,
  ...values,
});
describe("input validation", () => {
  it.each(["2026-02-31", "2026-02-29", "2026-13-01", "2026-1-01"])(
    "rejects invalid date %s",
    (dueAt) => expect(recordInput.safeParse(record({ kind: "event", dueAt })).success).toBe(false),
  );
  it("accepts a leap date", () =>
    expect(recordInput.safeParse(record({ kind: "event", dueAt: "2028-02-29" })).success).toBe(
      true,
    ));
  it.each(["javascript:alert(1)", "data:text/html,hello", "file:///a"])(
    "rejects active link %s",
    (url) =>
      expect(recordInput.safeParse(record({ kind: "bookmark", meta: { url } })).success).toBe(
        false,
      ),
  );
  it("rejects expense precision errors", () =>
    expect(
      recordInput.safeParse(
        record({
          kind: "expense",
          dueAt: "2026-11-04",
          meta: { amount: "1.005", direction: "out" },
        }),
      ).success,
    ).toBe(false));
  it("accepts cents as decimal strings", () =>
    expect(
      recordInput.safeParse(
        record({
          kind: "expense",
          dueAt: "2026-11-04",
          meta: { amount: "0.29", direction: "out" },
        }),
      ).success,
    ).toBe(true));
  it("rejects invalid priority", () =>
    expect(
      recordInput.safeParse(record({ kind: "task", meta: { priority: "urgent" } })).success,
    ).toBe(false));
  it("rejects backwards event times", () =>
    expect(
      recordInput.safeParse(
        record({ kind: "event", dueAt: "2026-11-04", meta: { time: "18:00", endTime: "09:00" } }),
      ).success,
    ).toBe(false));
  it("rejects duplicated checklist IDs", () =>
    expect(
      recordInput.safeParse(
        record({
          kind: "task",
          meta: {
            checklist: JSON.stringify([
              { id: "a", text: "one", done: false },
              { id: "a", text: "two", done: true },
            ]),
          },
        }),
      ).success,
    ).toBe(false));
  it("rejects malformed checklist data", () =>
    expect(
      recordInput.safeParse(record({ kind: "task", meta: { checklist: "[{}]" } })).success,
    ).toBe(false));
  it("rejects progress outside range", () =>
    expect(
      recordInput.safeParse(record({ kind: "project", meta: { progress: 101 } })).success,
    ).toBe(false));
});
describe("query and cursor", () => {
  it("binds user-controlled filters", () => {
    const r = recordQuery(
      "owner",
      new URLSearchParams({ q: "' OR 1=1 --", tag: "x'", collection: "fake", kind: "note" }),
    );
    expect(r.values[0]).toBe("owner");
    expect(r.where).not.toContain("OR 1=1 --");
    expect(r.values).toContain("' OR 1=1 --");
    expect(r.where).toContain("owner = ?");
  });
  it.each(["not-json", "[1,2,3]", '[2,"a","b"]', '[1,"a"]', "null"])(
    "rejects malformed cursor %s",
    (cursor) => expect(() => recordQuery("owner", new URLSearchParams({ cursor }))).toThrow(),
  );
  it("ignores an injected sort", () =>
    expect(
      recordQuery("owner", new URLSearchParams({ sort: "title; DROP TABLE records" })).order,
    ).toBe("pinned DESC, updated_at DESC, id DESC"));
  it("uses ascending title comparisons", () => {
    const r = recordQuery(
      "owner",
      new URLSearchParams({ sort: "title", cursor: JSON.stringify([1, "abc", "id"]) }),
    );
    expect(r.where).toContain("lower(title) > ?");
    expect(r.where).toContain("pinned < ?");
    expect(r.order).toContain("lower(title) ASC");
  });
  it("puts undated records last", () =>
    expect(recordQuery("owner", new URLSearchParams({ sort: "due" })).sortSql).toContain(
      "9999-12-31",
    ));
  it("keeps total filters separate from cursor", () => {
    const r = recordQuery(
      "owner",
      new URLSearchParams({
        cursor: JSON.stringify([0, "date", "id"]),
        priority: "high",
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    );
    expect(r.totalWhere).not.toContain("pinned <");
    expect(r.totalValues).toEqual(["owner", "2026-11-01", "2026-11-30", "high"]);
  });
});
describe("portable exports", () => {
  it.each(["=1+2", "+SUM(A1)", "-1+1", "@test", "\t=1"])("neutralizes CSV formula %s", (value) =>
    expect(csvCell(value).startsWith("\"'")).toBe(true),
  );
  it("quotes multiline values", () => expect(csvCell('a,"b\n')).toBe('"a,""b\n"'));
  it("writes decimal cent values", () =>
    expect(
      ledgerCSV([record({ kind: "expense", meta: { amount: "0.29", direction: "out" } })]),
    ).toContain('"0.29"'));
  it("escapes vCard line injection", () => {
    const value = vcard(
      record({
        kind: "contact",
        title: "Alice\nTEL:fake",
        meta: { phone: "123", email: "a@example.com" },
      }),
    );
    expect(value).toContain("FN:Alice\\nTEL:fake");
    expect(value.split("\r\n").filter((line) => line.startsWith("TEL:"))).toHaveLength(1);
  });
  it("uses the next date for all-day event end", () => {
    const value = ical([record({ kind: "event", dueAt: "2026-12-31" })]);
    expect(value).toContain("DTSTART;VALUE=DATE:20261231");
    expect(value).toContain("DTEND;VALUE=DATE:20270101");
  });
  it("exports explicit event end time", () =>
    expect(
      ical([
        record({ kind: "event", dueAt: "2026-11-04", meta: { time: "09:00", endTime: "10:30" } }),
      ]),
    ).toContain("DTEND:20261104T103000"));
});
