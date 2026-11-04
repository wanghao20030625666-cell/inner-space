"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Download, X, RefreshCw } from "lucide-react";
import { api, fileSize, type Data } from "../lib/client";
import UploadQueue, { type UploadBatch } from "./upload-queue";
import type { SpaceRecord } from "../lib/model";
/** Uploads attach files by authorized record ID; detaching keeps the file library copy. */
export default function Attachments({
  parent,
  disabled,
  onRunningChange,
  onChanged,
}: {
  parent: SpaceRecord;
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<SpaceRecord[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    input = useRef<HTMLInputElement>(null),
    [batch, setBatch] = useState<UploadBatch | null>(null);
  const load = useCallback(async () => {
    const r = await api<Data>(`/api/space?parent=${parent.id}&scope=all&lite=1`);
    setItems(r.items);
  }, [parent.id]);
  useEffect(() => {
    load().catch(() => setError("附件读取失败，可点击刷新重试"));
  }, [load]);
  function upload(files: FileList | null) {
    if (files?.length)
      setBatch({
        id: crypto.randomUUID(),
        files: Array.from(files),
        kind: "file",
        parentId: parent.id,
        collectionId: parent.collectionId,
      });
    if (input.current) input.current.value = "";
  }
  return (
    <section className="attachments">
      <div className="field-heading">
        <strong>
          <Paperclip size={14} />
          附件
        </strong>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="刷新附件"
            onClick={() => void load().catch(() => setError("读取失败"))}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || disabled}
            onClick={() => input.current?.click()}
          >
            {busy ? "正在上传…" : "添加附件"}
          </button>
        </div>
      </div>
      <input
        hidden
        multiple
        ref={input}
        type="file"
        onChange={(e) => void upload(e.target.files)}
      />
      <UploadQueue
        batch={batch}
        onComplete={async () => {
          onChanged();
          await load();
        }}
        onRunningChange={onRunningChange}
        inline
      />
      {error && <p className="form-error">{error}</p>}
      {items.map((r) => (
        <div className="attachment-row" key={r.id}>
          <span>
            <strong>{r.title}</strong>
            <small>{fileSize(r.meta.size)}</small>
          </span>
          <a
            aria-label={`下载附件 ${r.title}`}
            href={`/api/files/${r.id}`}
            download={String(r.meta.filename || r.title)}
          >
            <Download size={15} />
          </a>
          <button
            type="button"
            aria-label={`解除附件关联 ${r.title}`}
            disabled={busy || disabled}
            title="解除关联，文件仍保留在文件库"
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/space", {
                  method: "PATCH",
                  body: JSON.stringify({ id: r.id, version: r.version, meta: { parentId: "" } }),
                });
                onChanged();
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "操作失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {!items.length && !error && (
        <p className="field-hint">可添加文档、图片等文件，每个最多 25 MB。</p>
      )}
    </section>
  );
}
