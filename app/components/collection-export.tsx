"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { Collection } from "../lib/model";
import { exportBackup } from "../lib/backup";
/** Explicit format selection keeps record-only and attachment-backed exports distinguishable. */
export default function CollectionExport({
  collection,
  notify,
}: {
  collection: Collection;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  async function run(files: boolean) {
    setBusy(true);
    try {
      await exportBackup(files, setProgress, collection);
      notify("专题备份已生成，请保管好下载文件");
      setOpen(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : "专题导出失败");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <div className="collection-export">
      <button className="button secondary" disabled={busy} onClick={() => setOpen(!open)}>
        <Download size={14} />
        {busy ? "导出中…" : "导出专题"}
      </button>
      {open && (
        <div className="collection-export-options">
          <p>包含专题的正常、归档、回收站内容及关联附件。JSON 仅保存记录，ZIP 同时保存文件。</p>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => void run(false)}
          >
            导出 JSON
          </button>
          <button className="button primary small" disabled={busy} onClick={() => void run(true)}>
            导出附件 ZIP
          </button>
          {progress && <p role="status">{progress}</p>}
        </div>
      )}
    </div>
  );
}
