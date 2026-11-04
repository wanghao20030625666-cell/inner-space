import type { SpaceRecord } from "./model";
export type UploadBatch = {
  id: string;
  files: File[];
  kind: "file" | "photo";
  collectionId: string | null;
  parentId?: string;
};
export type UploadEntry = Omit<UploadBatch, "files" | "id"> & {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "failed" | "canceled";
  percent: number;
  error?: string;
  result?: SpaceRecord;
};
export type UploadTransport = (
  entry: UploadEntry,
  signal: AbortSignal,
  progress: (percent: number) => void,
) => Promise<SpaceRecord>;

/** One sequential queue owns transport state and emits completion only when fully drained. */
export class UploadQueueController {
  private rows: UploadEntry[] = [];
  private listeners = new Set<() => void>();
  private completed = new Set<() => void>();
  private seen = new Set<string>();
  private active = false;
  private paused = false;
  private pendingCompletion = false;
  private abort: AbortController | null = null;
  constructor(private transport: UploadTransport = uploadWithProgress) {}
  getSnapshot = () => this.rows;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  onDrain = (listener: () => void) => {
    this.completed.add(listener);
    return () => {
      this.completed.delete(listener);
    };
  };
  private publish(rows: UploadEntry[]) {
    this.rows = rows;
    this.listeners.forEach((listener) => listener());
  }
  private patch(id: string, value: Partial<UploadEntry>) {
    this.publish(this.rows.map((r) => (r.id === id ? { ...r, ...value } : r)));
  }
  enqueue(batch: UploadBatch) {
    if (this.seen.has(batch.id) || !batch.files.length) return;
    if (this.rows.length + batch.files.length > 200)
      throw new Error("一次上传队列最多 200 个文件，请完成并关闭后继续");
    this.seen.add(batch.id);
    if (this.seen.size > 100) this.seen.delete(this.seen.values().next().value!);
    this.pendingCompletion = true;
    this.publish([
      ...this.rows,
      ...batch.files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: batch.kind,
        collectionId: batch.collectionId,
        parentId: batch.parentId,
        status: "queued" as const,
        percent: 0,
      })),
    ]);
    void this.pump();
  }
  retry(id: string) {
    const entry = this.rows.find((r) => r.id === id);
    if (!entry || !["failed", "canceled"].includes(entry.status)) return;
    this.pendingCompletion = true;
    this.patch(id, { status: "queued", percent: 0, error: "" });
    void this.pump();
  }
  cancel(id?: string) {
    this.publish(
      this.rows.map((r) =>
        (!id || r.id === id) && r.status === "queued"
          ? { ...r, status: "canceled", error: "已取消" }
          : r,
      ),
    );
    if (this.rows.some((r) => (!id || r.id === id) && r.status === "uploading"))
      this.abort?.abort();
    void this.pump();
  }
  clear() {
    if (this.active || this.rows.some((r) => r.status === "queued")) return;
    this.publish([]);
  }
  pause() {
    this.paused = true;
    this.abort?.abort();
  }
  resume() {
    this.paused = false;
    void this.pump();
  }
  private async pump() {
    if (this.active || this.paused) return;
    this.active = true;
    try {
      for (;;) {
        if (this.paused) break;
        const entry = this.rows.find((r) => r.status === "queued");
        if (!entry) break;
        if (!entry.file.size || entry.file.size > 25 * 1024 * 1024) {
          this.patch(entry.id, { status: "failed", error: "文件需要在 1 字节到 25 MB 之间" });
          continue;
        }
        this.patch(entry.id, { status: "uploading", error: "" });
        const abort = new AbortController();
        this.abort = abort;
        try {
          const result = await this.transport(entry, abort.signal, (percent) =>
            this.patch(entry.id, { percent }),
          );
          this.patch(entry.id, { status: "done", percent: 100, result });
        } catch (error) {
          const canceled = abort.signal.aborted;
          this.patch(entry.id, {
            status: canceled ? "canceled" : "failed",
            error: canceled
              ? "已取消"
              : error instanceof Error
                ? error.message
                : "上传失败，请重试",
          });
        } finally {
          this.abort = null;
        }
      }
    } finally {
      this.active = false;
      if (
        !this.paused &&
        this.pendingCompletion &&
        !this.rows.some((r) => ["queued", "uploading"].includes(r.status))
      ) {
        this.pendingCompletion = false;
        this.completed.forEach((listener) => listener());
      }
    }
  }
}
/** XHR reports real byte progress; interrupted requests have explicitly uncertain outcomes. */
export const uploadWithProgress: UploadTransport = (entry, signal, progress) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("POST", "/api/upload");
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    request.onload = () => {
      cleanup();
      let value;
      try {
        value = JSON.parse(request.responseText);
      } catch {}
      if (request.status >= 200 && request.status < 300 && typeof value?.item?.id === "string")
        resolve(value.item);
      else reject(new Error(value?.error || "上传结果无法确认，请刷新列表后再重试"));
    };
    request.onerror = () => {
      cleanup();
      reject(new Error("网络中断，上传结果未确认，请先刷新列表核对"));
    };
    request.onabort = () => {
      cleanup();
      reject(new DOMException("已取消", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    const form = new FormData();
    form.set("file", entry.file);
    form.set("kind", entry.kind);
    if (entry.collectionId) form.set("collectionId", entry.collectionId);
    if (entry.parentId) form.set("parentId", entry.parentId);
    if (signal.aborted) {
      cleanup();
      reject(new DOMException("已取消", "AbortError"));
      return;
    }
    request.send(form);
  });
