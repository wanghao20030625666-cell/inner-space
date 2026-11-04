import { describe, it, expect, vi } from "vitest";
import { UploadQueueController, type UploadTransport } from "../app/lib/upload-queue";
import type { SpaceRecord } from "../app/lib/model";
const saved = { id: "saved" } as SpaceRecord;
const batch = (n: number, id = "batch") => ({
  id,
  files: Array.from({ length: n }, (_, i) => new File(["data"], `${i}.txt`)),
  kind: "file" as const,
  collectionId: null,
});
describe("shared upload lifecycle", () => {
  it("uploads 50 files sequentially and refreshes once", async () => {
    let concurrent = 0,
      max = 0;
    const transport = vi.fn<UploadTransport>(async () => {
        concurrent++;
        max = Math.max(max, concurrent);
        await Promise.resolve();
        concurrent--;
        return saved;
      }),
      queue = new UploadQueueController(transport),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue(batch(50));
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(transport).toHaveBeenCalledTimes(50);
    expect(max).toBe(1);
    expect(queue.getSnapshot().every((r) => r.status === "done")).toBe(true);
  });
  it("includes appended files before emitting completion", async () => {
    const pending: Array<(r: SpaceRecord) => void> = [],
      transport: UploadTransport = () => new Promise((resolve) => pending.push(resolve)),
      queue = new UploadQueueController(transport),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue(batch(1));
    queue.enqueue(batch(1, "second"));
    pending[0](saved);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(done).not.toHaveBeenCalled();
    pending[1](saved);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  });
  it("retry does not upload successful files again", async () => {
    let calls = 0;
    const queue = new UploadQueueController(async () => {
        if (++calls === 1) throw new Error("failed");
        return saved;
      }),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue(batch(2));
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    queue.retry(queue.getSnapshot()[0].id);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(2));
    expect(calls).toBe(3);
    expect(queue.getSnapshot().every((r) => r.status === "done")).toBe(true);
  });
  it("cancel aborts the current request and cancels queued files", async () => {
    const transport: UploadTransport = (_, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
      queue = new UploadQueueController(transport),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue(batch(3));
    queue.cancel();
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(queue.getSnapshot().map((r) => r.status)).toEqual(["canceled", "canceled", "canceled"]);
  });
  it("cancels one request while continuing the next", async () => {
    let calls = 0;
    const queue = new UploadQueueController((_, signal) =>
        ++calls === 1
          ? new Promise((_, reject) =>
              signal.addEventListener("abort", () => reject(new Error("abort"))),
            )
          : Promise.resolve(saved),
      ),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue(batch(2));
    queue.cancel(queue.getSnapshot()[0].id);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(queue.getSnapshot().map((r) => r.status)).toEqual(["canceled", "done"]);
  });
  it("rejects empty files without transport", () => {
    const transport = vi.fn<UploadTransport>(),
      queue = new UploadQueueController(transport),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue({ ...batch(1), files: [new File([], "empty.txt")] });
    expect(transport).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()[0].status).toBe("failed");
  });
  it("deduplicates the same batch and refuses to clear an active queue", async () => {
    const transport = vi.fn<UploadTransport>(async () => saved),
      queue = new UploadQueueController(transport),
      done = vi.fn();
    queue.onDrain(done);
    const value = batch(2);
    queue.enqueue(value);
    queue.enqueue(value);
    queue.clear();
    expect(queue.getSnapshot()).toHaveLength(2);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    queue.clear();
    expect(queue.getSnapshot()).toHaveLength(0);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("a paused unmounted queue does not notify completion", async () => {
    const transport: UploadTransport = (_, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("abort"))),
        ),
      queue = new UploadQueueController(transport),
      done = vi.fn();
    queue.onDrain(done);
    queue.enqueue(batch(1));
    queue.pause();
    await vi.waitFor(() => expect(queue.getSnapshot()[0].status).toBe("canceled"));
    expect(done).not.toHaveBeenCalled();
  });
});
