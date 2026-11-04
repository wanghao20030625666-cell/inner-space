"use client";
import { useState } from "react";
import { Plus, ArrowRight, RotateCcw, Check, CalendarDays, GripVertical } from "lucide-react";
import { localDate, type SpaceRecord } from "../lib/model";
import { formatDate } from "../lib/client";

const columns = [
  { id: "todo", name: "待开始" },
  { id: "doing", name: "进行中" },
  { id: "done", name: "已完成" },
] as const;
type Stage = (typeof columns)[number]["id"];
export function taskStage(item: SpaceRecord): Stage {
  return item.status === "done" ? "done" : item.meta.stage === "doing" ? "doing" : "todo";
}

/** Drag and button controls share the same version-checked update path. */
export default function TaskBoard({
  items,
  busy,
  onOpen,
  onCreate,
  onChange,
}: {
  items: SpaceRecord[];
  busy: boolean;
  onOpen: (r: SpaceRecord) => void;
  onCreate: () => void;
  onChange: (r: SpaceRecord, changes: Record<string, unknown>) => Promise<void>;
}) {
  const [over, setOver] = useState<Stage | null>(null);
  const move = (r: SpaceRecord, stage: Stage) =>
    onChange(r, { status: stage === "done" ? "done" : "active", meta: { ...r.meta, stage } });
  return (
    <div className="task-board">
      <p className="board-touch-hint">触屏操作请用卡片上的“开始 / 完成 / 重开”按钮切换状态。</p>
      {columns.map((c) => {
        const rows = items
          .filter((r) => taskStage(r) === c.id)
          .sort(
            (a, b) =>
              (a.meta.priority === "high" ? -1 : 0) - (b.meta.priority === "high" ? -1 : 0) ||
              (a.dueAt || "9999").localeCompare(b.dueAt || "9999"),
          );
        return (
          <section
            key={c.id}
            className={`board-column ${over === c.id ? "drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setOver(c.id);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain"),
                item = items.find((r) => r.id === id);
              if (item && !busy && taskStage(item) !== c.id) void move(item, c.id);
            }}
          >
            <header>
              <h2>
                <i className={`stage-dot ${c.id}`} />
                {c.name}
                <span>{rows.length}</span>
              </h2>
              {c.id === "todo" && (
                <button className="icon-button" onClick={onCreate} aria-label="新建待办">
                  <Plus size={17} />
                </button>
              )}
            </header>
            <div className="board-cards">
              {rows.map((r) => (
                <article
                  key={r.id}
                  className="board-task"
                  draggable={!busy}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", r.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className="board-task-top">
                    <span className={`priority ${r.meta.priority === "high" ? "high" : ""}`}>
                      {r.meta.priority === "high" ? "优先处理" : r.tags[0] || "待办"}
                    </span>
                    <GripVertical size={15} />
                  </div>
                  <button className="board-task-body" onClick={() => onOpen(r)}>
                    <h3>{r.title}</h3>
                    {r.content && <p>{r.content.slice(0, 85)}</p>}
                  </button>
                  <footer>
                    <span
                      className={
                        r.dueAt && r.dueAt < localDate() && c.id !== "done" ? "overdue" : ""
                      }
                    >
                      <CalendarDays size={12} />
                      {r.dueAt ? formatDate(r.dueAt) : "无截止日期"}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void move(r, c.id === "todo" ? "doing" : c.id === "doing" ? "done" : "todo")
                      }
                    >
                      {c.id === "todo" ? (
                        <>
                          开始
                          <ArrowRight size={13} />
                        </>
                      ) : c.id === "doing" ? (
                        <>
                          完成
                          <Check size={13} />
                        </>
                      ) : (
                        <>
                          重开
                          <RotateCcw size={12} />
                        </>
                      )}
                    </button>
                  </footer>
                </article>
              ))}
              {!rows.length && (
                <div className="board-empty">
                  {c.id === "todo" ? (
                    <button onClick={onCreate}>
                      <Plus size={15} />
                      添加待办
                    </button>
                  ) : c.id === "doing" ? (
                    "开始处理的待办会显示在这里"
                  ) : (
                    "完成的待办会显示在这里"
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
