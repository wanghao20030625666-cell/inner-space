"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { api } from "../lib/client";
import { loadProjectTasks } from "../lib/project-list";
import type { SpaceRecord } from "../lib/model";
/** Bounded pages preserve the visible range when returning from a task editor. */
export default function ProjectTasks({
  project,
  onOpen,
  disabled,
  visibleLimit,
  onVisibleLimit,
}: {
  project: SpaceRecord;
  onOpen: (item: SpaceRecord) => void;
  disabled: boolean;
  visibleLimit: number;
  onVisibleLimit: (count: number) => void;
}) {
  const [items, setItems] = useState<SpaceRecord[]>([]),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [total, setTotal] = useState(0),
    [done, setDone] = useState(0),
    [cursor, setCursor] = useState<string | null>(null),
    visible = useRef(visibleLimit),
    serial = useRef(0);
  const load = useCallback(
    async (append = false, after?: string | null) => {
      const generation = ++serial.current;
      const result = await loadProjectTasks(
        project.id,
        append ? { cursor: after } : { limit: visible.current },
      );
      if (generation !== serial.current) return;
      setItems((prev) =>
        append
          ? [...prev, ...result.items.filter((row) => !prev.some((old) => old.id === row.id))]
          : result.items,
      );
      visible.current = Math.max(
        200,
        append ? visible.current + result.items.length : result.items.length,
      );
      onVisibleLimit(visible.current);
      setTotal(result.total);
      setDone(result.done);
      setCursor(result.nextCursor);
    },
    [project.id, onVisibleLimit],
  );
  const invalidate = useCallback(() => {
    serial.current++;
  }, []);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void load()
      .catch(() => {
        if (active) setError("关联待办加载失败，请重试");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      invalidate();
    };
  }, [load, invalidate]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!title.trim() || busy || disabled) return;
    await run(async () => {
      await api("/api/space", {
        method: "POST",
        body: JSON.stringify({
          kind: "task",
          title: title.trim(),
          collectionId: project.collectionId,
          meta: { projectId: project.id, stage: "todo" },
        }),
      });
      setTitle("");
      await load();
    });
  }
  return (
    <section className="project-task-section">
      <div className="field-heading">
        <strong>项目待办</strong>
        <span>
          {done} / {total} 项已完成{total > items.length ? `（已显示 ${items.length} 项）` : ""}
        </span>
      </div>
      <p className="field-hint">新增和勾选会立即保存；点击待办名称编辑详情，关闭后返回项目。</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
          <button type="button" disabled={busy || disabled} onClick={() => void run(() => load())}>
            重试
          </button>
        </p>
      )}
      {busy && (
        <p className="field-hint" role="status">
          正在更新项目待办…
        </p>
      )}
      <div className="project-task-list">
        {items.map((r) => (
          <div className="project-task-row" key={r.id}>
            <button
              type="button"
              className={`task-check ${r.status === "done" ? "checked" : ""}`}
              aria-label={`${r.status === "done" ? "重开" : "完成"} ${r.title}`}
              disabled={busy || disabled}
              onClick={() =>
                void run(async () => {
                  await api("/api/space", {
                    method: "PATCH",
                    body: JSON.stringify({
                      id: r.id,
                      version: r.version,
                      status: r.status === "done" ? "active" : "done",
                      meta: { ...r.meta, stage: r.status === "done" ? "todo" : "done" },
                    }),
                  });
                  await load();
                })
              }
            >
              {r.status === "done" && <Check size={12} />}
            </button>
            <button
              type="button"
              className={`project-task-title ${r.status === "done" ? "struck" : ""}`}
              disabled={busy || disabled}
              onClick={() => onOpen(r)}
            >
              {r.title}
            </button>
          </div>
        ))}
      </div>
      {cursor && (
        <button
          type="button"
          className="button secondary small"
          disabled={busy || disabled}
          onClick={() => void run(() => load(true, cursor))}
        >
          加载更多项目待办
        </button>
      )}
      <div className="inline-task">
        <input
          aria-label="添加项目待办"
          placeholder="添加一个待办…"
          maxLength={160}
          value={title}
          disabled={busy || disabled}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={busy || disabled || !title.trim()}
          onClick={() => void create()}
        >
          {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}添加
        </button>
      </div>
    </section>
  );
}
