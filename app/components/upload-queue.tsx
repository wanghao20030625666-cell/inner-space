"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X, RefreshCw, Check, Upload } from "lucide-react";
import { fileSize } from "../lib/client";
import { UploadQueueController, type UploadBatch } from "../lib/upload-queue";
export type { UploadBatch } from "../lib/upload-queue";
/** File library and editor attachments use this same queue and progress controls. */
export default function UploadQueue({
  batch,
  onComplete,
  inline = false,
  onRunningChange,
}: {
  batch: UploadBatch | null;
  onComplete: () => Promise<void>;
  inline?: boolean;
  onRunningChange?: (running: boolean) => void;
}) {
  const [manager] = useState(() => new UploadQueueController()),
    rows = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot),
    [error, setError] = useState(""),
    doneCallback = useRef(onComplete);
  useEffect(() => {
    doneCallback.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    manager.resume();
    const unsubscribe = manager.onDrain(() => {
      void doneCallback.current().catch(() => setError("上传已结束，列表刷新失败，请点击刷新核对"));
    });
    return () => {
      unsubscribe();
      manager.pause();
    };
  }, [manager]);
  useEffect(() => {
    if (!batch) return;
    try {
      setError("");
      manager.enqueue(batch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加队列失败");
    }
  }, [batch, manager]);
  const running = rows.some((r) => ["queued", "uploading"].includes(r.status));
  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);
  useEffect(() => () => onRunningChange?.(false), [onRunningChange]);
  if (!rows.length && !error) return null;
  return (
    <section
      className={`upload-queue ${inline ? "inline-upload-queue" : ""}`}
      aria-label={inline ? "附件上传队列" : "文件上传队列"}
    >
      <header>
        <strong>
          <Upload size={15} />
          {inline ? "附件上传" : "文件上传"} · {rows.filter((r) => r.status === "done").length}/
          {rows.length}
        </strong>
        {running ? (
          <button type="button" aria-label="取消未完成上传" onClick={() => manager.cancel()}>
            取消未完成
          </button>
        ) : (
          <button
            type="button"
            aria-label="关闭上传队列"
            onClick={() => {
              manager.clear();
              setError("");
            }}
          >
            <X size={16} />
          </button>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
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
              <button
                type="button"
                aria-label={`取消上传 ${r.file.name}`}
                onClick={() => manager.cancel(r.id)}
              >
                <X size={15} />
              </button>
            ) : ["failed", "canceled"].includes(r.status) ? (
              <button
                type="button"
                aria-label={`重试上传 ${r.file.name}`}
                disabled={running}
                onClick={() => manager.retry(r.id)}
              >
                <RefreshCw size={15} />
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <p>
        整批结束后刷新列表。
        {inline ? "关闭编辑窗口会取消未完成的上传；已成功的附件会保留。" : "已成功的文件会保留。"}
      </p>
    </section>
  );
}
