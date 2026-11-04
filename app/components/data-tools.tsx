"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, RefreshCw, Tags, FilePenLine, ArrowRight } from "lucide-react";
import { api, formatTime, fileSize } from "../lib/client";
import { exportBackup, readBackup, restoreBackup, type PreparedBackup } from "../lib/backup";
import type { Kind } from "../lib/model";

export default function DataTools({
  notify,
  onChanged,
  onResume,
}: {
  notify: (s: string) => void;
  onChanged: () => Promise<void>;
  onResume: (key: string, kind: Kind) => void;
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [prepared, setPrepared] = useState<PreparedBackup | null>(null),
    input = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<
      { key: string; kind: Kind; title: string; version: number; updatedAt: string }[]
    >([]),
    [tags, setTags] = useState<{ name: string; count: number }[]>([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [tagConfirm, setTagConfirm] = useState(false),
    [usage, setUsage] = useState<{
      fileBytes: number;
      records: number;
      revisions: number;
      maxBytes: number;
      maxRecords: number;
    } | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    try {
      const results = await Promise.all([
        api<{ drafts: typeof drafts }>("/api/drafts"),
        api<{ tags: typeof tags }>("/api/tags"),
        api<NonNullable<typeof usage>>("/api/usage"),
      ]);
      setDrafts(results[0].drafts);
      setTags(results[1].tags);
      setUsage(results[2]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "数据读取失败");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    await run(async () => {
      setProgress("正在校验备份，尚未写入数据");
      setPrepared(await readBackup(file));
    });
    if (input.current) input.current.value = "";
  }
  async function restore() {
    if (!prepared) return;
    await run(async () => {
      try {
        const r = await restoreBackup(prepared, setProgress);
        setPrepared(null);
        notify(
          `已恢复 ${r.count} 条内容、${r.files} 个附件、${r.groups} 个专题，跳过 ${r.skipped} 条未包含原文件的附件`,
        );
      } catch (e) {
        notify(e instanceof Error ? e.message : "恢复未完成");
        throw e;
      } finally {
        await refresh();
        await onChanged();
      }
    });
  }
  async function changeTags() {
    await run(async () => {
      let done = 0;
      for (let batch = 0; batch < 201; batch++) {
        setProgress(`正在整理标签，已更新 ${done} 条`);
        const r = await api<{ changed: number; remaining: number }>("/api/tags", {
          method: "PATCH",
          body: JSON.stringify({ from, to }),
        });
        done += r.changed;
        if (!r.remaining) {
          notify(`已整理 ${done} 条记录的标签`);
          setTagConfirm(false);
          setFrom("");
          setTo("");
          await refresh();
          await onChanged();
          return;
        }
        if (!r.changed) throw new Error(`已更新 ${done} 条，其余记录有冲突，请重试`);
      }
      throw new Error("标签更新仍有剩余，可继续重试");
    });
  }
  return (
    <>
      <section className="panel settings-card">
        <div className="settings-title">
          <Download size={20} />
          <div>
            <h2>备份与恢复</h2>
            <p>导出文字，也可以连附件一起带走。</p>
          </div>
        </div>
        <div className="data-action">
          <div>
            <strong>记录备份 JSON</strong>
            <p>包含全部记录、回收站、专题和设置；附件保留索引。</p>
          </div>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => void run(() => exportBackup(false, setProgress))}
          >
            导出 JSON
          </button>
        </div>
        <div className="data-action">
          <div>
            <strong>带附件备份 ZIP</strong>
            <p>包含原文件、SHA-256 校验、全部记录及历史和操作记录归档。附件总量最多 100 MB。</p>
          </div>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => void run(() => exportBackup(true, setProgress))}
          >
            <Download size={14} />
            导出 ZIP
          </button>
        </div>
        <div className="data-action">
          <div>
            <strong>恢复备份</strong>
            <p>
              兼容 v1/v2 JSON 和 v3 ZIP。先校验再恢复，追加副本；ZIP
              恢复附件、专题、项目及附件关联，历史和操作日志只作归档。设置不会覆盖。
            </p>
          </div>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={14} />
            选择备份
          </button>
        </div>
        <input
          hidden
          ref={input}
          type="file"
          accept=".json,.zip,application/json,application/zip"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        {prepared && (
          <div className="restore-confirm">
            <strong>校验通过，准备恢复</strong>
            <p>
              {prepared.backup.records.length} 条内容 · {prepared.backup.collections?.length || 0}{" "}
              个专题 · {Object.keys(prepared.backup.files || {}).length}{" "}
              个附件。重复恢复会新增副本，错误发生前已完成的内容会保留。
            </p>
            <button className="button primary" disabled={busy} onClick={() => void restore()}>
              确认追加恢复
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setPrepared(null)}>
              取消
            </button>
          </div>
        )}
        {progress && (
          <p className="import-progress" role="status">
            {progress}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {usage && (
          <div className="usage-summary">
            <strong>空间用量</strong>
            <p>
              {usage.records.toLocaleString()} / {usage.maxRecords.toLocaleString()} 条内容 · 附件{" "}
              {fileSize(usage.fileBytes)} / {fileSize(usage.maxBytes)} ·{" "}
              {usage.revisions.toLocaleString()} 份历史快照
            </p>
            <progress max={usage.maxBytes} value={usage.fileBytes} />
            <small>
              回收站仍占用空间；彻底删除后释放记录用量。每条内容保留最近 100
              份历史，操作日志保留最近 10,000 条。
            </small>
          </div>
        )}
        <button className="text-button" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={13} />
          刷新数据状态
        </button>
      </section>
      <section className="panel settings-card">
        <div className="settings-title">
          <FilePenLine size={20} />
          <div>
            <h2>未完成的草稿</h2>
            <p>草稿在服务端保存，恢复后仍需保存正式内容。</p>
          </div>
        </div>
        {drafts.length ? (
          drafts.map((d) => (
            <div className="draft-row" key={d.key}>
              <button onClick={() => onResume(d.key, d.kind)}>
                <strong>{d.title || "未填写标题"}</strong>
                <small>{formatTime(d.updatedAt)}</small>
              </button>
              <ArrowRight size={14} />
              <button
                className="text-button danger-text"
                disabled={busy}
                onClick={() => {
                  if (confirm(`放弃草稿“${d.title || "未填写标题"}”？正式内容会保留。`))
                    void run(async () => {
                      await api("/api/drafts", {
                        method: "DELETE",
                        body: JSON.stringify({ key: d.key, version: d.version }),
                      });
                      await refresh();
                    });
                }}
              >
                放弃
              </button>
            </div>
          ))
        ) : (
          <p className="field-hint">没有未完成的草稿。</p>
        )}
      </section>
      <section className="panel settings-card">
        <div className="settings-title">
          <Tags size={20} />
          <div>
            <h2>标签管理</h2>
            <p>改名、合并或移除标签，正文和历史会保留。</p>
          </div>
        </div>
        <div className="tag-inventory">
          {tags.map((t) => (
            <button
              key={t.name}
              disabled={busy}
              className={from === t.name ? "selected" : ""}
              onClick={() => {
                setFrom(t.name);
                setTagConfirm(false);
              }}
            >
              {t.name}
              <small>{t.count}</small>
            </button>
          ))}
          {!tags.length && <p className="field-hint">给内容添加标签后会显示在这里。</p>}
        </div>
        {from && (
          <>
            <label className="field">
              已选标签
              <input readOnly value={from} />
            </label>
            <label className="field">
              新标签名称
              <input
                maxLength={24}
                placeholder="留空表示只移除标签"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setTagConfirm(false);
                }}
              />
            </label>
            <p className="field-hint">
              如果新名称已存在，会合并标签。作用于全部记录，包括归档和回收站，按批次执行。
            </p>
            {tagConfirm ? (
              <div className="restore-confirm">
                <p>
                  确认将“{from}”{to.trim() ? `改为“${to.trim()}”` : "从所有记录移除"}？
                </p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void changeTags()}
                >
                  确认整理标签
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setTagConfirm(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="button secondary"
                disabled={busy || from === to.trim()}
                onClick={() => setTagConfirm(true)}
              >
                整理这个标签
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
