"use client";
import { useState } from "react";
import type { DraftData } from "./draft-state";
import type { SpaceRecord } from "../lib/model";
/** Restoring only fills the editor; stale drafts require a second explicit choice. */
export default function DraftRecovery({
  draft,
  current,
  onRestore,
  onDiscard,
}: {
  draft: { data: DraftData; version: number; updatedAt: string };
  current?: SpaceRecord;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const [confirming, setConfirming] = useState(false),
    older =
      !!current &&
      ((draft.data.baseVersion !== undefined && draft.data.baseVersion < current.version) ||
        draft.updatedAt < current.updatedAt),
    date = (s: string) =>
      new Date(s).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
  return (
    <section className="draft-recovery">
      <strong>找到未完成的草稿</strong>
      <p>请先核对时间和内容。恢复只会填入编辑器，点击“保存内容”后才更新正式记录。</p>
      {older && (
        <p className="draft-warning" role="alert">
          这份草稿可能早于当前正式内容，直接保存可能覆盖较新的修改。
        </p>
      )}
      <div className="draft-comparison">
        {current && (
          <article>
            <h3>当前已保存内容 · v{current.version}</h3>
            <time>{date(current.updatedAt)}</time>
            <strong>{current.title}</strong>
            <pre>{current.content.slice(0, 700) || "没有正文"}</pre>
          </article>
        )}
        <article>
          <h3>
            未完成的草稿
            {draft.data.baseVersion !== undefined ? ` · 基于 v${draft.data.baseVersion}` : ""}
          </h3>
          <time>{date(draft.updatedAt)}</time>
          <strong>{draft.data.title || "未填写标题"}</strong>
          <pre>{draft.data.content.slice(0, 700) || "没有正文"}</pre>
        </article>
      </div>
      {confirming ? (
        <>
          <p>确认用这份较早的草稿继续编辑？正式内容仍会在保存时检查版本。</p>
          <button type="button" className="button primary" onClick={onRestore}>
            确认用此草稿继续编辑
          </button>
          <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
            继续核对
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button primary"
          onClick={() => (older ? setConfirming(true) : onRestore())}
        >
          恢复草稿
        </button>
      )}
      <button type="button" className="button secondary" onClick={onDiscard}>
        放弃草稿
      </button>
    </section>
  );
}
