"use client";
import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, Check, Upload } from "lucide-react";
import { fileSize } from "../lib/client";
export type UploadBatch = {
  id: string;
  files: File[];
  kind: "file" | "photo";
  collectionId: string | null;
};
type Entry = {
  id: string;
  file: File;
  kind: "file" | "photo";
  collectionId: string | null;
  status: "queued" | "uploading" | "done" | "failed" | "canceled";
  percent: number;
  error?: string;
};
/** Sequential uploads expose real byte progress, cancellation and failed-item retry. */
export default function UploadQueue({
  batch,
  onComplete,
}: {
  batch: UploadBatch | null;
  onComplete: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Entry[]>([]),
    [open, setOpen] = useState(true),
    xhr = useRef<XMLHttpRequest | null>(null),
    active = useRef(false),
    seen = useRef(""),
    doneCallback = useRef(onComplete);
  useEffect(() => {
    doneCallback.current = onComplete;
  }, [onComplete]);
  const update = (id: string, change: Partial<Entry>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));
  useEffect(() => {
    if (!batch || seen.current === batch.id) return;
    seen.current = batch.id;
    setOpen(true);
    setRows((list) => [
      ...list,
      ...batch.files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: batch.kind,
        collectionId: batch.collectionId,
        status: "queued" as const,
        percent: 0,
      })),
    ]);
  }, [batch]);
  useEffect(() => {
    if (active.current) return;
    const item = rows.find((r) => r.status === "queued");
    if (!item) return;
    active.current = true;
    update(item.id, { status: "uploading", error: "" });
    const task = async () => {
      if (!item.file.size || item.file.size > 25 * 1024 * 1024) {
        update(item.id, { status: "failed", error: "文件需要在 1 字节到 25 MB 之间" });
        return;
      }
      await new Promise<void>((resolve) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        request.open("POST", "/api/upload");
        request.upload.onprogress = (e) => {
          if (e.lengthComputable)
            update(item.id, { percent: Math.round((e.loaded / e.total) * 100) });
        };
        request.onload = () => {
          let result;
          try {
            result = JSON.parse(request.responseText);
          } catch {}
          update(
            item.id,
            request.status >= 200 && request.status < 300
              ? { status: "done", percent: 100 }
              : { status: "failed", error: result?.error || "上传失败，请重试" },
          );
          resolve();
        };
        request.onerror = () => {
          update(item.id, { status: "failed", error: "网络中断，请重试" });
          resolve();
        };
        request.onabort = () => {
          update(item.id, { status: "canceled", error: "已取消" });
          resolve();
        };
        const form = new FormData();
        form.set("file", item.file);
        form.set("kind", item.kind);
        if (item.collectionId) form.set("collectionId", item.collectionId);
        request.send(form);
      });
    };
    void task().finally(() => {
      active.current = false;
      xhr.current = null;
      setRows((list) => [...list]);
      void doneCallback.current();
    });
  }, [rows]);
  useEffect(() => () => xhr.current?.abort(), []);
  const running = rows.some((r) => ["queued", "uploading"].includes(r.status));
  if (!rows.length || !open) return null;
  return (
    <section className="upload-queue" aria-label="文件上传队列">
      <header>
        <strong>
          <Upload size={15} />
          文件上传 · {rows.filter((r) => r.status === "done").length}/{rows.length}
        </strong>
        {running ? (
          <button
            aria-label="取消未完成上传"
            onClick={() => {
              xhr.current?.abort();
              setRows((list) =>
                list.map((r) => (r.status === "queued" ? { ...r, status: "canceled" } : r)),
              );
            }}
          >
            取消未完成
          </button>
        ) : (
          <button
            aria-label="关闭上传队列"
            onClick={() => {
              setOpen(false);
              setRows([]);
            }}
          >
            <X size={16} />
          </button>
        )}
      </header>
      <div>
        {rows.map((r) => (
          <article key={r.id}>
            <span>
              <strong>{r.file.name}</strong>
              <small>
                {fileSize(r.file.size)} ·{" "}
                {r.status === "queued"
                  ? "等待上传"
                  : r.status === "uploading"
                    ? r.percent === 100
                      ? "正在保存…"
                      : `${r.percent}%`
                    : r.status === "done"
                      ? "已完成"
                      : r.error || "已取消"}
              </small>
              {r.status === "uploading" && <progress value={r.percent} max={100} />}
            </span>
            {r.status === "done" ? (
              <Check size={16} />
            ) : r.status === "uploading" ? (
              <button aria-label={`取消上传 ${r.file.name}`} onClick={() => xhr.current?.abort()}>
                <X size={15} />
              </button>
            ) : ["failed", "canceled"].includes(r.status) ? (
              <button
                aria-label={`重试上传 ${r.file.name}`}
                disabled={running}
                onClick={() => update(r.id, { status: "queued", percent: 0, error: "" })}
              >
                <RefreshCw size={15} />
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <p>网络中断后可重试失败项；已成功的文件会保留。</p>
    </section>
  );
}
