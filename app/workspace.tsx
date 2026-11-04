"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  Menu,
  X,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  ArrowUpRight,
  Upload,
  Loader2,
  List,
  Grid2X2,
  Columns3,
  Archive,
  Trash2,
  Star,
  Tag,
  Pencil,
} from "lucide-react";
import {
  kinds,
  localDate,
  type Kind,
  type SpaceRecord,
  type View,
  type Preferences,
} from "./lib/model";
import { api, type Data } from "./lib/client";
import { modules, extraModules, moduleFor } from "./lib/catalog";
import RecordCard from "./components/record-card";
import CalendarView from "./components/calendar";
import ActivityList from "./components/activity-list";
import SettingsPanel from "./components/settings";
import Dashboard from "./components/dashboard";
import TaskBoard from "./components/task-board";
import Ledger from "./components/ledger";
import UploadQueue, { type UploadBatch } from "./components/upload-queue";

import { useSpaceData } from "./hooks/use-space-data";
import { useWorkspaceUi } from "./hooks/use-workspace-ui";
import WorkspaceDialogs from "./components/workspace-dialogs";
import WorkspaceSidebar from "./components/workspace-sidebar";
export default function Workspace({
  user,
  initialPreferences,
}: {
  user: { name: string; email: string };
  initialPreferences: Preferences;
}) {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [status, setStatus] = useState("all"),
    [reading, setReading] = useState("all"),
    [month, setMonth] = useState("");
  const [sort, setSort] = useState("updated"),
    [priority, setPriority] = useState(""),
    [deadline, setDeadline] = useState(""),
    [fileType, setFileType] = useState(""),
    [kindFilter, setKindFilter] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(localDate().slice(0, 7)),
    [calendarDate, setCalendarDate] = useState(localDate()),
    [uploadBatch, setUploadBatch] = useState<UploadBatch | null>(null),
    [dropActive, setDropActive] = useState(false);
  const [collectionId, setCollectionId] = useState(""),
    [sidebar, setSidebar] = useState(false),
    [layout, setLayout] = useState<"grid" | "list" | "board">("grid"),
    [now, setNow] = useState<Date | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false);
  const ui = useWorkspaceUi();
  const {
    state: { undo, selected },
    setEditor,
    setChooser,
    setImageIndex,
    setUndo,
    setSelected,
    setDeleteItem,
    setBulkTrash,
    setCollectionEditor,
    setCollectionError,
  } = ui;
  const searchRef = useRef<HTMLInputElement>(null),
    uploadRef = useRef<HTMLInputElement>(null),
    uploadKind = useRef<Kind>("file");
  const resetSelection = useCallback(() => setSelected([]), [setSelected]);
  const { data, setData, loading, error, loadedKey, dataKey, reload, refreshCurrent, applyRecord } =
    useSpaceData(
      {
        view,
        search,
        collectionId,
        tag,
        status,
        reading,
        month,
        sort,
        priority,
        deadline,
        fileType,
        kindFilter,
        today: localDate(now || new Date()),
      },
      initialPreferences,
      resetSelection,
    );
  const selectedCollection = data.collections.find((c) => c.id === collectionId),
    current =
      view === "collection"
        ? {
            ...moduleFor("note"),
            name: selectedCollection?.name || "专题",
            description: "这个专题里的笔记、网页、文件和其他记录。",
            icon: FolderOpen,
          }
        : moduleFor(view),
    activeSearch = !!search;
  useEffect(() => {
    document.documentElement.dataset.theme = data.preferences.theme;
  }, [data.preferences.theme]);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const read = () => {
      const [v, c] = location.hash.slice(1).split("/");
      if ([...modules, ...extraModules].some((m) => m.id === v) || v === "collection") {
        setView(v as View);
        setCollectionId(v === "collection" ? c || "" : "");
        setQuery("");
        setSearch("");
        setTag("");
        setStatus("all");
        setReading("all");
        setMonth("");
        setSort("updated");
        setPriority("");
        setDeadline("");
        setFileType("");
        setKindFilter("");
        setSelected([]);
        setSidebar(false);
        setLayout(v === "task" ? "board" : v === "file" || v === "contact" ? "list" : "grid");
      }
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, [setSelected]);
  const navigate = (v: View, collection = "") => {
    setView(v);
    setCollectionId(collection);
    location.hash = v === "collection" ? `collection/${collection}` : v;
    setQuery("");
    setSearch("");
    setTag("");
    setStatus("all");
    setReading("all");
    setMonth("");
    setSort("updated");
    setPriority("");
    setDeadline("");
    setFileType("");
    setKindFilter("");
    setSelected([]);
    setSidebar(false);
    setLayout(v === "task" ? "board" : v === "file" || v === "contact" ? "list" : "grid");
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSidebar(false);
        setSelected([]);
      }
    };
    addEventListener("keydown", handle);
    return () => removeEventListener("keydown", handle);
  }, [setSelected]);
  const notifyError = (e: unknown) => setToast(e instanceof Error ? e.message : "操作未完成");
  const open = (item: SpaceRecord) => setEditor({ kind: item.kind, item });
  const create = (kind: Kind, date?: string) => {
    setChooser(false);
    if (kind === "file" || kind === "photo") {
      uploadKind.current = kind;
      if (uploadRef.current) {
        uploadRef.current.accept =
          kind === "photo" ? "image/png,image/jpeg,image/gif,image/webp" : "*/*";
        uploadRef.current.click();
      }
    } else setEditor({ kind, date });
  };
  async function mutate(item: SpaceRecord, changes: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await api<{ item: SpaceRecord }>("/api/space", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, version: item.version, ...changes }),
      });
      setUndo(changes.action === "trash" ? [result.item] : []);
      if (!applyRecord(item, result.item)) await refreshCurrent();
      setToast(
        changes.action === "trash"
          ? "已移入回收站"
          : changes.action === "restore"
            ? "已恢复"
            : "已更新",
      );
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }
  async function capture(text: string) {
    const lines = text.split("\n"),
      first = lines[0].trim();
    try {
      await api("/api/space", {
        method: "POST",
        body: JSON.stringify({
          kind: "inbox",
          title: first.slice(0, 160),
          content: first.length > 160 ? text : lines.slice(1).join("\n").trim(),
        }),
      });
      await refreshCurrent();
      setToast("已存到收集箱");
      return true;
    } catch (e) {
      notifyError(e);
      return false;
    }
  }
  function uploadFiles(files: FileList | null) {
    if (files?.length)
      setUploadBatch({
        id: crypto.randomUUID(),
        files: Array.from(files),
        kind: uploadKind.current === "photo" ? "photo" : "file",
        collectionId: collectionId === "none" ? null : collectionId || null,
      });
    if (uploadRef.current) uploadRef.current.value = "";
  }
  async function resumeDraft(key: string, kind: Kind) {
    if (key.startsWith("new-")) {
      create(kind);
      return;
    }
    try {
      const result = await api<Data>(`/api/space?scope=all&id=${encodeURIComponent(key)}&lite=1`);
      if (!result.items[0]) throw new Error("原记录已移入回收站或已删除，请先恢复记录");
      open(result.items[0]);
    } catch (e) {
      notifyError(e);
    }
  }
  async function duplicate(item: SpaceRecord) {
    setBusy(true);
    try {
      await api("/api/space", {
        method: "POST",
        body: JSON.stringify({
          ...item,
          title: (item.title + " · 副本").slice(0, 160),
          pinned: false,
          favorite: false,
        }),
      });
      await refreshCurrent();
      setToast("已创建副本");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  }
  async function undoTrash() {
    setBusy(true);
    let done = 0;
    for (const item of undo) {
      try {
        await api("/api/space", {
          method: "PATCH",
          body: JSON.stringify({ id: item.id, version: item.version, action: "restore" }),
        });
        done++;
      } catch {}
    }
    setUndo([]);
    await refreshCurrent();
    setBusy(false);
    setToast(`已恢复 ${done} 条内容`);
  }
  async function bulk(changes: Record<string, unknown>) {
    setBusy(true);
    let done = 0,
      failed = 0;
    for (const item of data.items.filter((r) => selected.includes(r.id))) {
      try {
        await api("/api/space", {
          method: "PATCH",
          body: JSON.stringify({ id: item.id, version: item.version, ...changes }),
        });
        done++;
      } catch {
        failed++;
      }
    }
    await refreshCurrent();
    setBusy(false);
    setBulkTrash(false);
    setToast(
      failed ? `已处理 ${done} 条，${failed} 条处理失败，请刷新后检查` : `已处理 ${done} 条内容`,
    );
  }
  const select = (id: string) => {
    if (selected.length >= 100 && !selected.includes(id)) {
      setToast("一次最多选择 100 条");
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };
  const addCollection = () => {
    setCollectionError("");
    setCollectionEditor({ name: "", color: "green" });
  };

  const recordActions = {
    open,
    duplicate: (r: SpaceRecord) => {
      void duplicate(r);
    },
    photoPreview: (r: SpaceRecord) =>
      setImageIndex(
        data.items
          .filter((x) => x.kind === "photo" && !x.deletedAt)
          .findIndex((x) => x.id === r.id),
      ),
    mutate: (r: SpaceRecord, changes: Record<string, unknown>) => {
      void mutate(r, changes);
    },
    select,
    remove: setDeleteItem,
  };
  return (
    <div className={`workspace ${data.preferences.theme === "dark" ? "dark" : ""}`}>
      {sidebar && (
        <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="关闭导航" />
      )}
      <WorkspaceSidebar
        data={data}
        user={user}
        view={view}
        collectionId={collectionId}
        sidebar={sidebar}
        navigate={navigate}
        addCollection={addCollection}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebar(true)}
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            <span>{data.preferences.name}</span>
            <ChevronRight size={13} />
            <strong>{activeSearch ? "搜索" : current.name}</strong>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="搜索所有内容"
                placeholder="搜索记录、正文、标签"
              />
              {query ? (
                <button onClick={() => setQuery("")} aria-label="清空搜索">
                  <X size={14} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="刷新内容"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <button
              className="button primary top-new"
              onClick={() =>
                kinds.includes(view as Kind) && !activeSearch
                  ? create(view as Kind)
                  : setChooser(true)
              }
            >
              <Plus size={16} />
              新建
            </button>
          </div>
        </header>
        <main
          className={`main-content ${dropActive ? "drop-active" : ""}`}
          onDragOver={(e) => {
            if (["file", "photo"].includes(view) && e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDropActive(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            if (["file", "photo"].includes(view)) {
              uploadKind.current = view as Kind;
              uploadFiles(e.dataTransfer.files);
            }
          }}
        >
          {dropActive && (
            <div className="drop-overlay">
              <Upload size={32} />
              松开后上传到当前{view === "photo" ? "相册" : "文件库"}
            </div>
          )}
          {view !== "overview" || activeSearch ? (
            <div className="page-heading">
              <div>
                <div className="page-location">
                  {activeSearch ? "搜索结果" : view === "collection" ? "我的专题" : "工作空间"}
                </div>
                <h1>{activeSearch ? `“${search}”` : current.name}</h1>
                <p>{activeSearch ? "匹配标题、正文和标签。" : current.description}</p>
              </div>
              <div className="heading-actions">
                {view === "collection" && selectedCollection && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setCollectionError("");
                      setCollectionEditor({
                        id: selectedCollection.id,
                        name: selectedCollection.name,
                        color: selectedCollection.color,
                      });
                    }}
                  >
                    <Pencil size={14} />
                    编辑专题
                  </button>
                )}
                {!["settings", "activity", "trash", "archive", "favorites"].includes(view) && (
                  <button
                    className="button primary"
                    onClick={() =>
                      kinds.includes(view as Kind) && !activeSearch
                        ? create(view as Kind)
                        : setChooser(true)
                    }
                  >
                    {view === "file" || view === "photo" ? (
                      <Upload size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    {view === "file"
                      ? "上传文件"
                      : view === "photo"
                        ? "上传照片"
                        : view === "event"
                          ? "新建日程"
                          : view === "expense"
                            ? "记一笔"
                            : view === "collection" || activeSearch
                              ? "添加内容"
                              : `新建${current.name}`}
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => void reload()}>
                重试
                <RefreshCw size={14} />
              </button>
            </div>
          )}
          {loading || loadedKey !== dataKey ? (
            <div className="loading-state">
              {!error && <Loader2 size={23} className="spin" />}
              <span>{error ? "内容未能加载，请重试" : "正在读取内容"}</span>
            </div>
          ) : view === "overview" && !activeSearch ? (
            <Dashboard
              data={data}
              now={now}
              busy={busy}
              onCreate={create}
              onOpen={open}
              onNavigate={navigate}
              onCollection={(c) => navigate("collection", c.id)}
              onCreateCollection={addCollection}
              onCapture={capture}
              onChange={mutate}
            />
          ) : view === "settings" && !activeSearch ? (
            <SettingsPanel
              preferences={data.preferences}
              user={user}
              notify={setToast}
              onImported={refreshCurrent}
              onResume={resumeDraft}
              onSaved={(p) => setData((d) => ({ ...d, preferences: p }))}
              onActivity={() => navigate("activity")}
            />
          ) : view === "activity" && !activeSearch ? (
            <section className="panel activity-panel">
              <ActivityList />
            </section>
          ) : (
            <>
              {view === "expense" && !activeSearch && (
                <Ledger
                  value={data.ledger}
                  params={
                    new URLSearchParams({
                      kind: "expense",
                      scope: "active",
                      ...(tag ? { tag } : {}),
                      ...(month ? { month } : {}),
                    })
                  }
                  notify={setToast}
                />
              )}
              {view === "task" && !activeSearch && (
                <div className="task-quick-filters">
                  {[
                    { id: "", name: "全部待办" },
                    { id: "overdue", name: "已逾期" },
                    { id: "today", name: "今天" },
                    { id: "week", name: "未来 7 天" },
                    { id: "undated", name: "未设日期" },
                  ].map((f) => (
                    <button
                      className={deadline === f.id ? "selected" : ""}
                      key={f.id}
                      onClick={() => {
                        setDeadline(f.id);
                        setStatus("all");
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                  <select
                    aria-label="按优先级筛选"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="">全部优先级</option>
                    <option value="high">高</option>
                    <option value="normal">普通</option>
                    <option value="low">低</option>
                  </select>
                </div>
              )}
              {["file", "photo"].includes(view) && !activeSearch && (
                <p className="upload-hint">
                  可以把文件拖到这里上传，每个最多 25 MB。
                  {view === "photo" ? "支持 JPG、PNG、GIF 和 WebP。" : ""}
                </p>
              )}
              <div className="content-toolbar">
                <div className="filter-tabs">
                  <button
                    className={status === "all" && reading === "all" ? "selected" : ""}
                    onClick={() => {
                      setStatus("all");
                      setReading("all");
                    }}
                  >
                    全部<span>{data.total}</span>
                  </button>
                  {["task", "project"].includes(view) && (
                    <>
                      <button
                        className={status === "active" ? "selected" : ""}
                        onClick={() => setStatus("active")}
                      >
                        未完成
                      </button>
                      <button
                        className={status === "done" ? "selected" : ""}
                        onClick={() => setStatus("done")}
                      >
                        已完成
                      </button>
                    </>
                  )}
                  {view === "bookmark" && (
                    <>
                      <button
                        className={reading === "unread" ? "selected" : ""}
                        onClick={() => setReading("unread")}
                      >
                        待读
                      </button>
                      <button
                        className={reading === "read" ? "selected" : ""}
                        onClick={() => setReading("read")}
                      >
                        已读
                      </button>
                    </>
                  )}
                </div>
                <div className="toolbar-right">
                  {activeSearch && (
                    <select
                      aria-label="按内容类型筛选"
                      value={kindFilter}
                      onChange={(e) => setKindFilter(e.target.value)}
                    >
                      <option value="">全部类型</option>
                      {modules.slice(1).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {view === "file" && (
                    <select
                      aria-label="文件类型筛选"
                      value={fileType}
                      onChange={(e) => setFileType(e.target.value)}
                    >
                      <option value="">全部文件</option>
                      <option value="image">图片</option>
                      <option value="document">其他文件</option>
                    </select>
                  )}
                  {view !== "event" && (
                    <select
                      aria-label="内容排序"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="updated">最近更新</option>
                      <option value="created">最近创建</option>
                      <option value="title">标题 A–Z</option>
                      <option value="due">日期从近到远</option>
                    </select>
                  )}
                  {["expense", "journal"].includes(view) && (
                    <input
                      type="month"
                      className="month-filter"
                      aria-label="按月份筛选"
                      value={month}
                      onInput={(e) => setMonth(e.currentTarget.value)}
                      onChange={(e) => setMonth(e.target.value)}
                    />
                  )}
                  {data.tags.length > 0 && (
                    <label className="tag-filter">
                      <Tag size={14} />
                      <select
                        aria-label="按标签筛选"
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                      >
                        <option value="">标签</option>
                        {data.tags.map((t) => (
                          <option value={t.name} key={t.name}>
                            {t.name} ({t.count})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {view !== "event" && (
                    <div className="view-toggle">
                      {view === "task" && (
                        <button
                          aria-label="看板视图"
                          className={layout === "board" ? "selected" : ""}
                          onClick={() => setLayout("board")}
                        >
                          <Columns3 size={17} />
                        </button>
                      )}
                      <button
                        aria-label="卡片视图"
                        className={layout === "grid" ? "selected" : ""}
                        onClick={() => setLayout("grid")}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        aria-label="列表视图"
                        className={layout === "list" ? "selected" : ""}
                        onClick={() => setLayout("list")}
                      >
                        <List size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {view !== "event" && layout !== "board" && data.items.length > 0 && (
                <div className="selection-bar">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="选择当前页内容"
                      checked={
                        selected.length > 0 &&
                        data.items.slice(0, 100).every((r) => selected.includes(r.id))
                      }
                      onChange={() =>
                        setSelected(
                          selected.length ? [] : data.items.slice(0, 100).map((r) => r.id),
                        )
                      }
                    />
                    {selected.length ? `已选 ${selected.length} 条` : `${data.total} 条内容`}
                  </label>
                  {selected.length > 0 && (
                    <div className="bulk-actions">
                      {view === "trash" ? (
                        <button disabled={busy} onClick={() => void bulk({ action: "restore" })}>
                          恢复
                        </button>
                      ) : (
                        <>
                          <button disabled={busy} onClick={() => void bulk({ favorite: true })}>
                            <Star size={13} />
                            星标
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void bulk({ action: view === "archive" ? "unarchive" : "archive" })
                            }
                          >
                            <Archive size={13} />
                            {view === "archive" ? "取消归档" : "归档"}
                          </button>
                          <select
                            aria-label="批量移入专题"
                            value=""
                            disabled={busy}
                            onChange={(e) => {
                              if (e.target.value)
                                void bulk({
                                  collectionId: e.target.value === "none" ? null : e.target.value,
                                });
                            }}
                          >
                            <option value="">移入专题</option>
                            <option value="none">移出专题</option>
                            {data.collections.map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={busy}
                            className="danger-text"
                            onClick={() => setBulkTrash(true)}
                          >
                            <Trash2 size={13} />
                            回收站
                          </button>
                        </>
                      )}
                      <button onClick={() => setSelected([])} aria-label="取消选择">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {view === "task" && layout === "board" && !activeSearch ? (
                <TaskBoard
                  items={data.items}
                  busy={busy}
                  onOpen={open}
                  onCreate={() => create("task")}
                  onChange={mutate}
                />
              ) : view === "event" && !activeSearch ? (
                <CalendarView
                  month={calendarMonth}
                  onMonth={setCalendarMonth}
                  selected={calendarDate}
                  onSelect={setCalendarDate}
                  weekStartsMonday={data.preferences.weekStartsMonday}
                  onOpen={open}
                  onCreate={(date) => create("event", date)}
                />
              ) : data.items.length ? (
                <div
                  className={`${layout === "list" ? "record-list" : "record-grid"} ${view === "journal" ? "journal-stream" : ""} ${view === "photo" ? "photo-grid" : ""}`}
                >
                  {data.items.map((r) => (
                    <RecordCard
                      key={r.id}
                      item={r}
                      list={layout === "list"}
                      selected={selected.includes(r.id)}
                      collections={data.collections}
                      projectProgress={data.projectTasks.find((p) => p.projectId === r.id)}
                      busy={busy}
                      actions={recordActions}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <current.icon size={29} />
                  <h2>
                    {activeSearch || tag || status !== "all" || reading !== "all" || month
                      ? "没有符合条件的内容"
                      : view === "trash"
                        ? "回收站是空的"
                        : view === "archive"
                          ? "没有归档内容"
                          : view === "favorites"
                            ? "还没有星标内容"
                            : "这里还没有内容"}
                  </h2>
                  <p>
                    {activeSearch || tag
                      ? "可以换一个关键词，或取消筛选。"
                      : view === "collection"
                        ? "编辑内容时选择这个专题，或直接在这里添加。"
                        : view === "favorites"
                          ? "在内容的更多操作中选择“加入星标”。"
                          : view === "trash"
                            ? "移入回收站的内容可以在这里恢复。"
                            : current.description}
                  </p>
                  {!["trash", "archive", "favorites"].includes(view) && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        kinds.includes(view as Kind) ? create(view as Kind) : setChooser(true)
                      }
                    >
                      <Plus size={15} />
                      添加内容
                    </button>
                  )}
                </div>
              )}
              {data.nextCursor && (
                <div className="load-more">
                  <button className="button secondary" onClick={() => void reload(true)}>
                    加载更多
                    <ChevronRight size={15} />
                  </button>
                  <span>
                    已显示 {data.items.length} / {data.total} 条
                  </span>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <i />
              {error ? "连接异常" : "记录按登录账户隔离"}
            </span>
            <span>隐序</span>
            <button onClick={() => navigate("activity")}>
              操作记录
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      <input
        hidden
        ref={uploadRef}
        type="file"
        multiple
        onChange={(e) => void uploadFiles(e.target.files)}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {undo.length > 0 && (
            <button disabled={busy} onClick={() => void undoTrash()}>
              撤销移入回收站
            </button>
          )}
          <button onClick={() => setToast("")} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
      <UploadQueue batch={uploadBatch} onComplete={refreshCurrent} />
      <WorkspaceDialogs
        ui={ui}
        data={data}
        busy={busy}
        setBusy={setBusy}
        setToast={setToast}
        collectionId={collectionId}
        view={view}
        navigate={navigate}
        create={create}
        open={open}
        bulk={bulk}
        refreshCurrent={refreshCurrent}
        onRecordSaved={async (previous, item) => {
          if (!applyRecord(previous, item)) await refreshCurrent();
        }}
      />
    </div>
  );
}
