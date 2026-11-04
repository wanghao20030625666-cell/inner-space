import { describe, it, expect } from "vitest";
import { trashBatchInput } from "../app/lib/trash";
import { renderToStaticMarkup } from "react-dom/server";
import TrashDeleteDialog from "../app/components/trash-delete-dialog";
const item = { id: "00000000-0000-4000-8000-000000000001", version: 2 };
describe("reviewed permanent deletion", () => {
  it("allows a reviewed version but rejects duplicate identities", () => {
    expect(trashBatchInput.safeParse({ items: [item] }).success).toBe(true);
    expect(trashBatchInput.safeParse({ items: [item, item] }).success).toBe(false);
  });
  it("requires a bounded batch and positive integer versions", () => {
    expect(trashBatchInput.safeParse({ items: [] }).success).toBe(false);
    expect(trashBatchInput.safeParse({ items: [{ ...item, version: 1.5 }] }).success).toBe(false);
    expect(trashBatchInput.safeParse({ items: [{ ...item, version: 0 }] }).success).toBe(false);
    expect(trashBatchInput.safeParse({ items: [item], scope: "all" }).success).toBe(false);
  });
  it("requires stronger acknowledgement for clearing than selected deletion", () => {
    const props = { onClose: () => {}, onFinished: async () => {} };
    const clear = renderToStaticMarkup(
      <TrashDeleteDialog {...props} snapshot={{ items: [item], all: true }} />,
    );
    const selected = renderToStaticMarkup(
      <TrashDeleteDialog {...props} snapshot={{ items: [item], all: false }} />,
    );
    expect(clear).toContain("输入数量 1");
    expect(selected).not.toContain("输入数量");
    expect(clear).toContain("disabled");
    expect(clear).toContain("之后新移入");
  });
});
