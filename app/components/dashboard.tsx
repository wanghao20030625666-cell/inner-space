"use client";
import OnThisDay from "./on-this-day";
import LedgerTrend from "./ledger-trend";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Pin,
  Check,
  Inbox,
  FolderOpen,
  Bookmark,
  CornerDownLeft,
  NotebookPen,
} from "lucide-react";
import { formatDate, formatTime, fileSize, countByKind, type Data } from "../lib/client";
import { moduleFor } from "../lib/catalog";
import { localDate, type Kind, type SpaceRecord, type View, type Collection } from "../lib/model";

type Props = {
  data: Data;
  now: Date | null;
  busy: boolean;
  onCreate: (kind: Kind, date?: string) => void;
  onOpen: (item: SpaceRecord) => void;
  onNavigate: (view: View) => void;
  onCollection: (c: Collection) => void;
  onCreateCollection: () => void;
  onCapture: (text: string) => Promise<boolean>;
  onChange: (item: SpaceRecord, changes: Record<string, unknown>) => Promise<void>;
};
export default function Dashboard({
  data,
  now,
  busy,
  onCreate,
  onOpen,
  onNavigate,
  onCollection,
  onCreateCollection,
  onCapture,
  onChange,
}: Props) {
  const [capture, setCapture] = useState(""),
    [saving, setSaving] = useState(false);
  const count = (kind: Kind, status?: string) => countByKind(data.counts, kind, status);
  async function save() {
    if (!capture.trim()) return;
    setSaving(true);
    try {
      if (await onCapture(capture.trim())) setCapture("");
    } finally {
      setSaving(false);
    }
  }
  const today = localDate(now || new Date()),
    d = now || new Date(),
    offset = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7;
  const monthDays = Array.from(
    { length: offset + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() > 35 ? 42 : 35 },
    (_, i) => new Date(d.getFullYear(), d.getMonth(), i - offset + 1),
  );
  const recent = data.recent;
  return (
    <div className="dashboard">
      <div className="home-intro">
        <div>
          <div className="date-line">
            {now
              ? now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })
              : "今天"}
          </div>
          <h1>我的工作台</h1>
          {data.preferences.motto && <p>{data.preferences.motto}</p>}
        </div>
        <button className="button secondary" onClick={() => onCreate("journal", today)}>
          <NotebookPen size={16} />
          写今天的日记
        </button>
      </div>
      <div className="desk-metrics">
        {[
          { label: "待整理", value: count("inbox"), suffix: "条", target: "inbox", icon: Inbox },
          {
            label: "未完成待办",
            value: count("task", "active"),
            suffix: "项",
            target: "task",
            icon: Check,
          },
          {
            label: "待读网页",
            value: data.stats.unread || 0,
            suffix: "篇",
            target: "bookmark",
            icon: Bookmark,
          },
          {
            label: "文件与图片",
            value: fileSize(data.stats.fileBytes),
            suffix: "",
            target: "file",
            icon: FolderOpen,
          },
        ].map((m) => (
          <button key={m.label} onClick={() => onNavigate(m.target as View)}>
            <span>
              <m.icon size={15} />
              {m.label}
            </span>
            <strong>
              {m.value}
              <small>{m.suffix}</small>
            </strong>
            {m.target === "task" && data.stats.overdue > 0 && (
              <em>{data.stats.overdue} 项已过期</em>
            )}
          </button>
        ))}
      </div>
      <div className="desk-columns">
        <div className="desk-main">
          <section className="panel capture-panel">
            <header>
              <h2>随手记</h2>
              <span>先存到收集箱，之后再整理</span>
            </header>
            <textarea
              aria-label="随手记内容"
              rows={3}
              placeholder="记一件事，粘贴一段文字，或者放一个链接…"
              maxLength={100000}
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            <footer>
              <span>
                <CornerDownLeft size={13} />
                Ctrl / ⌘ + Enter 保存
              </span>
              <button
                className="button primary"
                disabled={saving || !capture.trim()}
                onClick={() => void save()}
              >
                {saving ? "保存中…" : "存到收集箱"}
                <ArrowRight size={15} />
              </button>
            </footer>
          </section>
          {data.pinned.length > 0 && (
            <section className="pinned-section">
              <div className="section-title">
                <h2>
                  <Pin size={15} />
                  置顶
                </h2>
                <span>常用的几份内容</span>
              </div>
              <div className="pin-grid">
                {data.pinned.map((r) => {
                  const m = moduleFor(r.kind);
                  return (
                    <button key={r.id} onClick={() => onOpen(r)}>
                      <m.icon size={19} />
                      <span>
                        <strong>{r.title}</strong>
                        <small>
                          {m.name} · {formatDate(r.updatedAt)}
                        </small>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <section className="panel recent-panel">
            <header className="panel-heading">
              <h2>最近编辑</h2>
              <span>按更新时间排列</span>
            </header>
            {recent.length ? (
              <div className="desk-recent">
                {recent.map((r) => {
                  const m = moduleFor(r.kind),
                    collection = data.collections.find((c) => c.id === r.collectionId);
                  return (
                    <button key={r.id} onClick={() => onOpen(r)}>
                      <span className={`document-icon ${r.kind}`}>
                        <m.icon size={19} />
                      </span>
                      <span className="recent-name">
                        <strong>{r.title}</strong>
                        <small>
                          {collection?.name || m.name}
                          {r.tags[0] ? ` / ${r.tags[0]}` : ""}
                        </small>
                      </span>
                      {r.pinned && <Pin size={12} className="muted-icon" />}
                      <time>{formatTime(r.updatedAt)}</time>
                      <ArrowUpRight size={14} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="getting-started">
                <h3>开始放些自己的内容进来</h3>
                <p>可以先写一份笔记，或者把手边的资料放进来。</p>
                <div>
                  <button onClick={() => onCreate("note")}>
                    <NotebookPen size={17} />
                    新建笔记
                    <ArrowRight size={13} />
                  </button>
                  <button onClick={() => onCreate("bookmark")}>
                    <Bookmark size={17} />
                    保存链接
                    <ArrowRight size={13} />
                  </button>
                  <button onClick={() => onCreate("file")}>
                    <FolderOpen size={17} />
                    上传文件
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </section>
          <OnThisDay items={data.onThisDay} onOpen={onOpen} />
          <section className="collection-section">
            <div className="section-title">
              <h2>我的专题</h2>
              <button className="text-button" onClick={onCreateCollection}>
                <Plus size={14} />
                新建专题
              </button>
            </div>
            {data.collections.length ? (
              <div className="collection-grid">
                {data.collections.slice(0, 6).map((c) => (
                  <button key={c.id} onClick={() => onCollection(c)}>
                    <span className={`collection-symbol ${c.color}`}>
                      <FolderOpen size={22} />
                    </span>
                    <strong>{c.name}</strong>
                    <small>{c.count} 条内容</small>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="collection-empty">
                <FolderOpen size={23} />
                <div>
                  <strong>按一件事、一个方向归在一起</strong>
                  <p>一个专题可以同时放笔记、网页、文件和待办。</p>
                </div>
                <button className="button secondary" onClick={onCreateCollection}>
                  <Plus size={14} />
                  新建
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="desk-aside">
          <section className="panel desk-tasks">
            <header className="panel-heading">
              <h2>接下来要做</h2>
              <button
                className="icon-button"
                onClick={() => onCreate("task")}
                aria-label="添加待办"
              >
                <Plus size={17} />
              </button>
            </header>
            {data.dueTasks.length ? (
              <div>
                {data.dueTasks.map((r) => (
                  <div className="desk-task" key={r.id}>
                    <button
                      className="task-check"
                      disabled={busy}
                      aria-label={`完成 ${r.title}`}
                      onClick={() =>
                        void onChange(r, { status: "done", meta: { ...r.meta, stage: "done" } })
                      }
                    />
                    <button onClick={() => onOpen(r)}>
                      <strong>{r.title}</strong>
                      <small className={r.dueAt && r.dueAt < today ? "overdue" : ""}>
                        {r.dueAt ? formatDate(r.dueAt) : "未设截止日期"}
                        {r.meta.priority === "high" ? " · 优先处理" : ""}
                      </small>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="quiet-empty">
                <p>还没有未完成的待办。</p>
                <button onClick={() => onCreate("task")}>
                  <Plus size={14} />
                  添加待办
                </button>
              </div>
            )}
            <button className="panel-bottom" onClick={() => onNavigate("task")}>
              查看待办看板
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="panel mini-calendar">
            <header>
              <h2>
                {d.getFullYear()} 年 {d.getMonth() + 1} 月
              </h2>
              <button className="text-button" onClick={() => onNavigate("event")}>
                日历
                <ArrowUpRight size={13} />
              </button>
            </header>
            <div className="mini-calendar-grid">
              {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
                <span key={w}>{w}</span>
              ))}
              {monthDays.map((day) => {
                const date = localDate(day);
                return (
                  <button
                    className={`${day.getMonth() !== d.getMonth() ? "outside" : ""} ${date === today ? "today" : ""}`}
                    key={date}
                    onClick={() => onCreate("event", date)}
                    title={`添加 ${date} 的日程`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="desk-agenda">
              {data.upcoming.length ? (
                data.upcoming.slice(0, 3).map((r) => (
                  <button key={r.id} onClick={() => onOpen(r)}>
                    <span>
                      {formatDate(r.dueAt)}
                      <small>{String(r.meta.time || "全天")}</small>
                    </span>
                    <strong>{r.title}</strong>
                  </button>
                ))
              ) : (
                <p>近期没有安排日程。</p>
              )}
            </div>
          </section>
          {data.ledger.months.length > 0 && (
            <section className="panel home-trend">
              <LedgerTrend months={data.ledger.months} anchor={today.slice(0, 7)} />
            </section>
          )}
          <section className="recent-activity">
            <div className="section-title">
              <h2>最近操作</h2>
              <button aria-label="查看全部操作记录" onClick={() => onNavigate("activity")}>
                <ArrowUpRight size={15} />
              </button>
            </div>
            {data.activity.slice(0, 4).map((a) => (
              <div key={a.id}>
                <i />
                <span>
                  <strong>
                    {a.action} · {a.title}
                  </strong>
                  <time>{formatTime(a.createdAt)}</time>
                </span>
              </div>
            ))}
            {!data.activity.length && <p>保存或修改内容后，会在这里留下记录。</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
