"use client";
import { useEffect, useRef, useState } from "react";
import {
  Star,
  Trash2,
  ArrowUpRight,
  Download,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  Pin,
  MoreHorizontal,
  Archive,
  Check,
  BookOpen,
} from "lucide-react";
import { exportRecord } from "../lib/exports";
import { readChecklist } from "./checklist";
import { moduleFor } from "../lib/catalog";
import { fileSize, formatDate, formatTime } from "../lib/client";
import { safeLink, type SpaceRecord, type Collection } from "../lib/model";

export type RecordActions = {
  open: (item: SpaceRecord) => void;
  duplicate: (item: SpaceRecord) => void;
  photoPreview: (item: SpaceRecord) => void;
  mutate: (item: SpaceRecord, changes: Record<string, unknown>) => void;
  select: (id: string) => void;
  remove: (item: SpaceRecord) => void;
};
type Props = {
  item: SpaceRecord;
  list: boolean;
  busy: boolean;
  selected: boolean;
  collections: Collection[];
  projectProgress?: { total: number; done: number };
  actions: RecordActions;
};
export default function RecordCard({
  item: r,
  list,
  busy,
  selected,
  collections,
  projectProgress,
  actions,
}: Props) {
  const onOpen = () => actions.open(r),
    onDuplicate = () => actions.duplicate(r),
    onPhotoPreview = () => actions.photoPreview(r),
    onSelect = () => actions.select(r.id),
    onDelete = () => actions.remove(r),
    onFavorite = () => actions.mutate(r, { favorite: !r.favorite }),
    onPin = () => actions.mutate(r, { pinned: !r.pinned }),
    onToggle = () =>
      actions.mutate(r, {
        status: r.status === "done" ? "active" : "done",
        meta: { ...r.meta, stage: r.status === "done" ? "todo" : "done" },
      }),
    onRestore = () => actions.mutate(r, { action: "restore" }),
    onTrash = () => actions.mutate(r, { action: "trash" }),
    onArchive = () =>
      actions.mutate(r, { action: r.status === "archived" ? "unarchive" : "archive" }),
    onRead = () =>
      actions.mutate(r, {
        meta: { ...r.meta, readState: r.meta.readState === "read" ? "unread" : "read" },
      });
  const m = moduleFor(r.kind),
    Icon = m.icon,
    collection = collections.find((c) => c.id === r.collectionId),
    url = safeLink(r.meta.url);
  const domain = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  const progress = projectProgress?.total
    ? Math.round((projectProgress.done / projectProgress.total) * 100)
    : Number(r.meta.progress || 0);
  const [menu, setMenu] = useState(false),
    menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);
  const action = (fn: () => void) => {
    setMenu(false);
    fn();
  };
  return (
    <article
      className={`record-card entry ${list ? "list-card" : ""} ${selected ? "selected-entry" : ""} ${r.status === "done" ? "completed" : ""} ${r.kind === "journal" ? "journal-entry" : ""}`}
      data-kind={r.kind}
    >
      {r.kind === "photo" && !r.deletedAt && !list && (
        <button className="photo-cover" onClick={onPhotoPreview}>
          <img src={`/api/files/${r.id}`} alt={r.title} loading="lazy" />
        </button>
      )}
      {r.kind === "bookmark" && !list && (
        <a className="bookmark-domain" href={url} target="_blank" rel="noopener noreferrer">
          <span>{domain.charAt(0).toUpperCase() || "W"}</span>
          {domain}
          <ExternalLink size={13} />
        </a>
      )}
      <div className="record-top">
        <label className="entry-selection">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`选择 ${r.title}`}
          />
          <span className="document-icon">
            <Icon size={19} />
          </span>
        </label>
        <span className="record-kind">{m.name}</span>
        {r.pinned && <Pin size={13} className="pin-mark" />}
        {r.favorite && <Star size={13} fill="currentColor" className="starred" />}
        {!r.deletedAt && (
          <div ref={menuRef} className="entry-menu">
            <button
              className="icon-button"
              onClick={() => setMenu(!menu)}
              aria-label={`更多操作 ${r.title}`}
              aria-expanded={menu}
            >
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="entry-menu-content">
                <button disabled={busy} onClick={() => action(onOpen)}>
                  编辑内容
                </button>
                {!["file", "photo"].includes(r.kind) && (
                  <>
                    <button disabled={busy} onClick={() => action(onDuplicate)}>
                      复制为新记录
                    </button>
                    <button onClick={() => action(() => exportRecord(r))}>
                      导出{r.kind === "contact" ? "名片" : r.kind === "event" ? "日历" : "内容"}
                    </button>
                  </>
                )}
                <button disabled={busy} onClick={() => action(onPin)}>
                  <Pin size={14} />
                  {r.pinned ? "取消置顶" : "置顶到主页"}
                </button>
                <button disabled={busy} onClick={() => action(onFavorite)}>
                  <Star size={14} />
                  {r.favorite ? "取消星标" : "加入星标"}
                </button>
                <button disabled={busy} onClick={() => action(onArchive)}>
                  <Archive size={14} />
                  {r.status === "archived" ? "取消归档" : "归档"}
                </button>
                <button disabled={busy} className="danger-text" onClick={() => action(onTrash)}>
                  <Trash2 size={14} />
                  移入回收站
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {r.kind === "journal" && (
        <div className="journal-date">
          <time>{formatDate(r.dueAt || r.createdAt, true)}</time>
          <span>
            {new Date(r.dueAt || r.createdAt).toLocaleDateString("zh-CN", { weekday: "long" })}
          </span>
        </div>
      )}
      <button className="record-body" onClick={onOpen}>
        <h3>{r.title}</h3>
        {r.kind === "expense" ? (
          <div className={`expense-amount ${r.meta.direction === "in" ? "positive" : ""}`}>
            {r.meta.direction === "in" ? "+" : "−"} ¥ {Number(r.meta.amount || 0).toFixed(2)}
            <small>{String(r.meta.category || "未分类")}</small>
          </div>
        ) : (
          <p>
            {r.content.replace(/[#*`>]/g, "").slice(0, r.kind === "journal" ? 260 : 140) ||
              (r.kind === "file" || r.kind === "photo"
                ? `${fileSize(r.meta.size)} · ${String(r.meta.filename || r.title)
                    .split(".")
                    .at(-1)
                    ?.toUpperCase()}`
                : r.kind === "contact"
                  ? [r.meta.company, r.meta.phone, r.meta.email].filter(Boolean).join(" · ") ||
                    "未填写联系方式"
                  : r.kind === "bookmark"
                    ? String(r.meta.url || "")
                    : "未填写正文")}
          </p>
        )}
        {r.kind === "project" && (
          <div className="project-progress">
            <span>
              <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </span>
            <small>{progress}%</small>
            {projectProgress?.total ? (
              <em>
                {projectProgress.done}/{projectProgress.total} 项待办
              </em>
            ) : (
              <em>手动进度</em>
            )}
          </div>
        )}
      </button>
      {r.kind === "task" && readChecklist(r.meta.checklist).length > 0 && (
        <p className="checklist-progress">
          子清单 {readChecklist(r.meta.checklist).filter((x) => x.done).length}/
          {readChecklist(r.meta.checklist).length}
        </p>
      )}
      {r.kind === "contact" && !r.deletedAt && (
        <div className="contact-links">
          {r.meta.phone && (
            <a href={`tel:${String(r.meta.phone).replace(/[^+0-9*#,;]/g, "")}`}>
              {String(r.meta.phone)}
            </a>
          )}
          {r.meta.email && (
            <a href={`mailto:${encodeURIComponent(String(r.meta.email))}`}>发送邮件</a>
          )}
          <button onClick={() => exportRecord(r)}>导出名片</button>
        </div>
      )}
      <div className="record-tags">
        {collection && (
          <span className={`collection-label ${collection.color}`}>{collection.name}</span>
        )}
        {r.tags.slice(0, 3).map((t) => (
          <span key={t}>#{t}</span>
        ))}
        {r.status === "archived" && <span>已归档</span>}
      </div>
      <div className="record-footer">
        <time title={formatTime(r.updatedAt)}>
          {r.dueAt ? formatDate(r.dueAt) : formatDate(r.updatedAt)}
        </time>
        {r.deletedAt ? (
          <div className="record-actions">
            <button onClick={onRestore} disabled={busy}>
              <RotateCcw size={14} />
              恢复
            </button>
            <button
              className="danger-text"
              onClick={onDelete}
              disabled={busy}
              aria-label="彻底删除"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ) : r.kind === "task" ? (
          <button
            className={`task-status ${r.status === "done" ? "done" : ""}`}
            onClick={onToggle}
            disabled={busy}
          >
            {r.status === "done" ? <CheckCircle2 size={14} /> : <span />}
            {r.status === "done" ? "已完成" : "完成"}
          </button>
        ) : r.kind === "bookmark" ? (
          <div className="record-actions">
            <button
              className={`reading-state ${r.meta.readState === "read" ? "read" : ""}`}
              onClick={onRead}
              disabled={busy}
            >
              {r.meta.readState === "read" ? <Check size={13} /> : <BookOpen size={13} />}
              {r.meta.readState === "read" ? "已读" : "待读"}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="打开收藏网页">
              <ArrowUpRight size={16} />
            </a>
          </div>
        ) : ["file", "photo"].includes(r.kind) ? (
          <a
            href={`/api/files/${r.id}`}
            download={String(r.meta.filename || r.title)}
            aria-label={`下载 ${r.title}`}
          >
            <Download size={16} />
          </a>
        ) : (
          <button onClick={onOpen} aria-label="打开内容">
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
