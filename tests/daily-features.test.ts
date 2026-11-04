import { describe, it, expect } from "vitest";
import {
  buildReminders,
  nextBirthday,
  trashExpiry,
  type ReminderSource,
} from "../app/lib/reminders";
import { readCaptureHash, captureHash, bookmarklet } from "../app/lib/capture";
import { imageIds, imageMarkdown, inlineImage, remapImages } from "../app/lib/inline-images";
import { recordInput } from "../app/lib/model";
const imageId = "00000000-0000-4000-8000-000000000001",
  newId = "00000000-0000-4000-8000-000000000002";
describe("personal calendar dates", () => {
  it("keeps today and rolls past birthdays across the year", () => {
    expect(nextBirthday("11-04", "2026-11-04")).toBe("2026-11-04");
    expect(nextBirthday("01-02", "2026-12-30")).toBe("2027-01-02");
  });
  it("uses the stated leap-day policy", () => {
    expect(nextBirthday("02-29", "2027-02-27")).toBe("2027-02-28");
    expect(nextBirthday("02-29", "2028-02-27")).toBe("2028-02-29");
  });
  it.each(["02-30", "13-01", "2-29", "<img>"])("rejects invalid birthdays %s", (v) =>
    expect(nextBirthday(v, "2026-11-04")).toBeNull(),
  );
  it("uses calendar dates rather than DST elapsed hours", () => {
    const rows: ReminderSource[] = [
      {
        id: "x",
        kind: "event",
        title: "夏令时",
        dueAt: "2026-03-09",
        meta: { reminderType: "countdown" },
      },
    ];
    expect(buildReminders(rows, "2026-03-07")[0].days).toBe(2);
  });
  it("includes overdue renewal and future dates without mutating them", () => {
    const rows: ReminderSource[] = [
      {
        id: "a",
        kind: "event",
        title: "续费",
        dueAt: "2026-11-03",
        meta: { reminderType: "subscription" },
      },
      { id: "b", kind: "contact", title: "生日", dueAt: null, meta: { birthday: "11-05" } },
    ];
    expect(buildReminders(rows, "2026-11-04").map((r) => r.days)).toEqual([-1, 1]);
    expect(rows[0].dueAt).toBe("2026-11-03");
  });
  it("does not render ordinary events or invalid metadata", () => {
    expect(
      buildReminders(
        [{ id: "a", kind: "event", title: "普通", dueAt: "2026-11-05", meta: {} }],
        "2026-11-04",
      ),
    ).toEqual([]);
  });
  it("leaves automatic retention disabled and follows exact expiry time", () => {
    expect(trashExpiry("2026-11-01T12:00:00Z", 0)).toBeNull();
    expect(trashExpiry("2026-11-01T12:00:00Z", 30, new Date("2026-12-01T11:59:00Z"))?.days).toBe(1);
    expect(trashExpiry("2026-11-01T12:00:00Z", 30, new Date("2026-12-01T12:00:00Z"))?.due).toBe(
      true,
    );
  });
  it("validates birthday and reminder type at the record boundary", () => {
    expect(
      recordInput.safeParse({ kind: "contact", title: "a", meta: { birthday: "02-30" } }).success,
    ).toBe(false);
    expect(
      recordInput.safeParse({
        kind: "event",
        title: "a",
        dueAt: "2026-11-04",
        meta: { reminderType: "unknown" },
      }).success,
    ).toBe(false);
  });
});
describe("explicit quick capture", () => {
  it("round trips encoded title, URL and note text", () => {
    const value = {
      kind: "bookmark" as const,
      title: "A&B 中文",
      content: "一行\n两行",
      url: "https://example.com/?x=1&y=2",
    };
    expect(readCaptureHash(captureHash(value))).toEqual(value);
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "file:///test"])(
    "rejects unsafe URL %s",
    (url) => expect(readCaptureHash("#capture?url=" + encodeURIComponent(url))).toBeNull(),
  );
  it("rejects unknown kinds, ordinary hashes and oversized data", () => {
    expect(readCaptureHash("#capture?kind=photo")).toBeNull();
    expect(readCaptureHash("#note")).toBeNull();
    expect(readCaptureHash("#capture?kind=note&text=" + "x".repeat(16000))).toBeNull();
  });
  it("does not place webpage contents or credential reads in the bookmarklet", () => {
    const code = bookmarklet("https://example.chatgpt.site");
    expect(code).toContain("document.title");
    expect(code).not.toContain("document.cookie");
    expect(code).not.toContain("innerHTML");
    expect(code).not.toContain("fetch(");
  });
});
describe("protected inline image references", () => {
  it("accepts protected UUID images and refuses external/active URLs", () => {
    expect(inlineImage(imageMarkdown(imageId, "截图"))?.src).toBe("/api/files/" + imageId);
    expect(inlineImage("![x](https://track.invalid/a.png)")).toBeNull();
    expect(inlineImage("![x](javascript:alert(1))")).toBeNull();
  });
  it("deduplicates and remaps only image references", () => {
    const content = imageMarkdown(imageId, "a") + "\n" + imageMarkdown(imageId, "b");
    expect(imageIds(content)).toEqual([imageId]);
    expect(imageIds(remapImages(content, new Map([[imageId, newId]])))).toEqual([newId]);
  });
  it("turns unrestored image references into explanatory text", () =>
    expect(remapImages(imageMarkdown(imageId, "x"), new Map(), true)).toBe(
      "[图片未随备份恢复：x]",
    ));
  it("escapes pasted image labels without changing the file path", () =>
    expect(imageMarkdown(imageId, "[bad]\nname")).not.toContain("[[bad]"));
});
