"use client";
import { useState } from "react";
import Modal from "./modal";
import { api } from "../lib/client";
import type { TrashResult, TrashSnapshot } from "../lib/trash";
/** Review a fixed snapshot, then delete in bounded batches without retrying changed records. */
export default function TrashDeleteDialog({
  snapshot,
  onClose,
  onFinished,
}: {
  snapshot: TrashSnapshot;
  onClose: () => void;
  onFinished: () => Promise<void>;
}) {
  const [ack, setAck] = useState(false),
    [count, setCount] = useState(""),
    [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0),
    [result, setResult] = useState<{
      deleted: number;
      skipped: number;
      uncertain: number;
      pending: boolean;
    } | null>(null);
  const [error, setError] = useState("");
  async function remove() {
    setRunning(true);
    const totals = { deleted: 0, skipped: 0, uncertain: 0, pending: false };
    try {
      for (let i = 0; i < snapshot.items.length; i += 10) {
        const items = snapshot.items.slice(i, i + 10);
        try {
          const response = await api<{ results: TrashResult[]; cleanupPending: number }>(
            "/api/trash",
            { method: "POST", body: JSON.stringify({ items }) },
          );
          totals.deleted += response.results.filter((r) => r.status === "deleted").length;
          totals.skipped += response.results.filter((r) => r.status !== "deleted").length;
          totals.pending ||= response.cleanupPending > 0;
        } catch {
          // A lost response may follow a committed write. Do not guess or retry a permanent deletion.
          totals.uncertain += items.length;
        }
        setProcessed(Math.min(i + 10, snapshot.items.length));
        if (totals.uncertain) {
          totals.uncertain += snapshot.items.length - Math.min(i + 10, snapshot.items.length);
          break;
        }
      }
      setResult(totals);
      try {
        await onFinished();
      } catch {
        setError("删除结果已记录，但列表刷新失败，请关闭后手动刷新核对。");
      }
    } finally {
      setRunning(false);
    }
  }
  return (
    <Modal
      title={
        result
          ? "删除结果"
          : snapshot.all
            ? `清空回收站中的 ${snapshot.items.length} 条内容？`
            : `彻底删除所选 ${snapshot.items.length} 条内容？`
      }
      subtitle="删除内容及其历史版本无法撤销。单独保存的附件和相册图片按各自记录保留。"
      onClose={() => {
        if (!running) onClose();
      }}
    >
      <div className="trash-delete-body">
        {result ? (
          <div role="status">
            <p>
              已删除 {result.deleted} 条，跳过 {result.skipped} 条，未确认 {result.uncertain} 条。
            </p>
            {result.skipped > 0 && (
              <p className="field-hint">跳过的内容可能已恢复、更新或删除，请重新核对。</p>
            )}
            {result.uncertain > 0 && (
              <p className="form-error">
                部分请求结果未确认，后续批次已停止。请刷新核对剩余内容后再操作。
              </p>
            )}
            {result.pending && <p className="field-hint">部分附件文件待清理，可在设置中重试。</p>}
          </div>
        ) : (
          <>
            <p className="field-hint">
              仅处理当前确认的内容。之后新移入的内容不会被清除，已恢复或更新的记录会跳过。
            </p>
            <label className="trash-ack">
              <input
                type="checkbox"
                checked={ack}
                disabled={running}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已确认这些内容不再需要，删除后无法恢复
            </label>
            {snapshot.all && (
              <label className="field">
                输入数量 {snapshot.items.length} 以确认清空
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={count}
                  disabled={running}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
            )}
            {running && (
              <p role="status">
                正在处理 {processed} / {snapshot.items.length}，请保持页面打开。
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button className="button secondary" disabled={running} onClick={onClose}>
            {result ? "完成" : "取消"}
          </button>
          {!result && (
            <button
              className="button danger"
              disabled={
                running || !ack || (snapshot.all && count.trim() !== String(snapshot.items.length))
              }
              onClick={() => void remove()}
            >
              {running ? "正在删除…" : "确认彻底删除"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
