"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, CheckSquare2, CalendarDays, Bookmark, FolderOpen, Star, Settings2, ShieldCheck, Search, Plus, ArrowUpRight, ChevronRight, Menu, X, Upload, RefreshCw, FileText, Clock3, Tag, List, Grid2X2, Loader2, ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { kinds, localDate, type Kind, type SpaceRecord, type View } from "./lib/model";
import { api, formatDate, type Data, initialData } from "./lib/client";
import { modules, extraModules, moduleFor, type Module } from "./lib/catalog";
import Modal from "./components/modal";
import Editor from "./components/editor";
import RecordCard from "./components/record-card";
import CalendarView from "./components/calendar";
import ActivityList from "./components/activity-list";
import SettingsPanel from "./components/settings";
export default function Workspace({ user }: { user: { name: string; email: string } }) {
  const [view, setView] = useState<View>("overview"), [data, setData] = useState<Data>(initialData);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [sidebar, setSidebar] = useState(false), [grid, setGrid] = useState(true), [status, setStatus] = useState("all"), [tag, setTag] = useState("");
  const [editor, setEditor] = useState<{ kind: Kind; item?: SpaceRecord; date?: string } | null>(null), [chooser, setChooser] = useState(false);
  const [toast, setToast] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SpaceRecord | null>(null), [now, setNow] = useState<Date | null>(null);
  const searchRef = useRef<HTMLInputElement>(null), uploadRef = useRef<HTMLInputElement>(null), uploadKind = useRef<Kind>("file"), requestId = useRef(0);
  const current = moduleFor(view), activeSearch = !!search.trim();

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  useEffect(() => { const id = setTimeout(() => setSearch(query.trim()), 260); return () => clearTimeout(id); }, [query]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { const value = location.hash.slice(1); if ([...modules, ...extraModules].some(m => m.id === value)) setView(value as View); const handler = () => { const v = location.hash.slice(1); if ([...modules, ...extraModules].some(m => m.id === v)) setView(v as View); }; addEventListener("hashchange", handler); return () => removeEventListener("hashchange", handler); }, []);

  const notifyError = (e: unknown) => setToast(e instanceof Error ? e.message : "操作未完成");
  const navigate = (next: View) => { setView(next); location.hash = next; setQuery(""); setSearch(""); setStatus("all"); setTag(""); setSidebar(false); };
  const reload = useCallback(async (append = false) => {
    const id = ++requestId.current;
    if (!append) setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ today: localDate() });
      if (search) p.set("q", search);
      if (!search && kinds.includes(view as Kind)) p.set("kind", view);
      p.set("scope", view === "trash" ? "trash" : view === "archive" ? "archive" : view === "favorites" ? "favorites" : "active");
      if (append && data.nextCursor) p.set("cursor", data.nextCursor);
      const result = await api<Data>(`/api/space?${p}`);
      if (id === requestId.current) setData(prev => ({ ...result, items: append ? [...prev.items, ...result.items.filter(r => !prev.items.some(old => old.id === r.id))] : result.items }));
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : "加载失败"); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [view, search, data.nextCursor]);
  useEffect(() => { void reload(); }, [view, search]); // Cursor changes must not reset the current page.

  const create = (kind: Kind, date?: string) => {
    if (kind === "file" || kind === "photo") { uploadKind.current = kind; if (uploadRef.current) { uploadRef.current.accept = kind === "photo" ? "image/png,image/jpeg,image/gif,image/webp" : "*/*"; uploadRef.current.click(); } }
    else setEditor({ kind, date });
    setChooser(false);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setChooser(false); setSidebar(false); }
    };
    addEventListener("keydown", handler); return () => removeEventListener("keydown", handler);
  }, []);

  const mutate = async (item: SpaceRecord, changes: Record<string, unknown>) => {
    setBusy(true);
    try { await api("/api/space", { method: "PATCH", body: JSON.stringify({ id: item.id, version: item.version, ...changes }) }); await reload(); setToast(changes.action === "trash" ? "已移入回收站，可以随时恢复" : changes.action === "restore" ? "内容已恢复" : "已更新"); }
    catch (e) { notifyError(e); } finally { setBusy(false); }
  };
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let completed = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} 超过 25 MB，已完成 ${completed} 个文件`);
        setUploading(`正在上传 ${completed + 1}/${files.length} · ${file.name}`);
        const form = new FormData(); form.set("file", file); form.set("kind", uploadKind.current);
        await api("/api/upload", { method: "POST", body: form }); completed++;
      }
      setToast(`已保存 ${completed} 个${uploadKind.current === "photo" ? "照片" : "文件"}`);
    } catch (e) { notifyError(e); } finally { setUploading(""); if (uploadRef.current) uploadRef.current.value = ""; await reload(); }
  };

  const visible = useMemo(() => data.items.filter(r => (!tag || r.tags.includes(tag)) && (status === "all" || r.status === status)), [data.items, tag, status]);
  const tags = [...new Set(data.items.flatMap(r => r.tags))].sort();
  const count = (id: View) => data.counts.filter(c => id === "trash" ? !!c.deleted : !c.deleted && (id === "archive" ? c.status === "archived" : c.status !== "archived" && (id === "favorites" ? !!c.favorite : c.kind === id))).reduce((s, c) => s + c.count, 0);
  const total = data.counts.filter(c => !c.deleted && c.status !== "archived").reduce((s, c) => s + c.count, 0);
  const taskTotal = data.counts.filter(c => c.kind === "task" && c.status === "active" && !c.deleted).reduce((s, c) => s + c.count, 0);
  const theme = data.preferences.theme;
  const emptyAction = () => kinds.includes(view as Kind) ? create(view as Kind) : setChooser(true);

  return <div className={`workspace ${theme === "dark" ? "dark" : ""}`}>
    {sidebar && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <a className="brand" href="#overview" onClick={() => navigate("overview")}><span className="brand-mark"><i /><i /><i /><i /></span><span>隐序<span className="brand-en">INNER SPACE</span></span></a>
      <div className="space-switch"><span className="space-avatar">{data.preferences.name.slice(0, 1)}</span><div><strong>{data.preferences.name}</strong><small><span className="online-dot" /> 私人工作空间</small></div><LockKeyhole size={14} /></div>
      <div className="nav-scroll"><div className="nav-label">工作空间</div>
        <nav aria-label="工作空间">{modules.slice(0, 2).map(m => <NavItem key={m.id} m={m} active={view === m.id} count={m.id === "inbox" ? count(m.id) : undefined} onClick={() => navigate(m.id)} />)}
          <div className="nav-label">记录与计划</div>{modules.slice(2, 7).map(m => <NavItem key={m.id} m={m} active={view === m.id} onClick={() => navigate(m.id)} />)}
          <div className="nav-label">资料与生活</div>{modules.slice(7).map(m => <NavItem key={m.id} m={m} active={view === m.id} onClick={() => navigate(m.id)} />)}
          <div className="nav-divider" />{extraModules.slice(0, 3).map(m => <NavItem key={m.id} m={m} active={view === m.id} count={m.id === "trash" ? count(m.id) || undefined : undefined} onClick={() => navigate(m.id)} />)}
        </nav>
      </div>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={17} /><span>仅自己可见<small>你的内容，留在你的空间</small></span></div><NavItem m={extraModules[4]} active={view === "settings"} onClick={() => navigate("settings")} /><button className="account" onClick={() => navigate("settings")}><span className="account-avatar">{(user.name === "我的空间" ? data.preferences.name : user.name).slice(0, 1).toUpperCase()}</span><span><strong>{user.name === "我的空间" ? data.preferences.name : user.name}</strong><small>个人账户</small></span><Settings2 size={15} /></button></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setSidebar(true)} aria-label="打开导航"><Menu size={20} /></button><span className="breadcrumb-home">私人空间</span><span className="slash">/</span><strong>{activeSearch ? "全局搜索" : current.name}</strong></div>
        <div className="topbar-actions"><div className="global-search"><Search size={16} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索所有内容" placeholder="搜索所有内容…" />{query ? <button aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button> : <kbd>Ctrl K</kbd>}</div><button className="icon-button" onClick={() => void reload()} disabled={loading} aria-label="刷新内容"><RefreshCw size={17} className={loading ? "spin" : ""} /></button><span className="top-private"><LockKeyhole size={13} /> 私密</span><button className="top-avatar" onClick={() => navigate("settings")} aria-label="账户设置">{data.preferences.name.slice(0, 1)}</button></div>
      </header>

      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">{view === "overview" && !activeSearch ? "YOUR PERSONAL WORKSPACE" : "INNER SPACE / " + (activeSearch ? "SEARCH" : current.id.toUpperCase())}</div><h1>{activeSearch ? `搜索「${search}」` : current.name}</h1><p>{activeSearch ? "搜索标题、正文与标签，跨模块查找你的内容。" : current.description}</p></div><div className="heading-actions">{view === "overview" && !activeSearch && <span className="today-date"><CalendarDays size={15} />{now ? now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }) : "今天"}</span>}<button className="button primary" onClick={() => kinds.includes(view as Kind) && !activeSearch ? create(view as Kind) : setChooser(true)}><Plus size={17} />{view === "file" ? "上传文件" : view === "photo" ? "上传照片" : kinds.includes(view as Kind) && !activeSearch ? `新建${current.name === "待办事项" ? "待办" : current.name === "日历" ? "日程" : current.name === "网页收藏" ? "收藏" : current.name === "个人账本" ? "收支" : current.name}` : "新建内容"}</button></div></div>

        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void reload()}>重试 <RefreshCw size={14} /></button></div>}
        {loading ? <div className="loading-state"><Loader2 className="spin" size={25} /><p>正在打开你的空间…</p></div> : <>
          {view === "overview" && !activeSearch ? <>
            <section className="welcome-banner"><div className="welcome-copy"><span className="welcome-badge"><span /> 一个只属于自己的地方</span><h2>{now && now.getHours() < 12 ? "早上好" : now && now.getHours() < 18 ? "下午好" : "晚上好"}，欢迎回来。</h2><p>{data.preferences.motto}</p><button onClick={() => create("note")}>记录此刻的想法 <ArrowUpRight size={16} /></button></div><div className="banner-art" aria-hidden="true"><div className="art-arch"><div className="art-sun" /><div className="art-grid" /><div className="art-hill hill-one" /><div className="art-hill hill-two" /><div className="art-hill hill-three" /></div><span className="art-caption">A LITTLE ROOM FOR YOURSELF</span></div></section>
            <div className="stats-grid">{[{ label: "空间内容", value: total, icon: FolderOpen, color: "green", caption: "记录生活的每一个侧面", target: "note" }, { label: "待办事项", value: taskTotal, icon: CheckSquare2, color: "orange", caption: "按自己的节奏，逐步完成", target: "task" }, { label: "笔记与日记", value: count("note") + count("journal"), icon: NotebookPen, color: "blue", caption: "留下想法，也留下日常", target: "note" }, { label: "星标内容", value: count("favorites"), icon: Star, color: "purple", caption: "把重要的，留在手边", target: "favorites" }].map(s => <button className="stat-card" key={s.label} onClick={() => navigate(s.target as View)}><div className="stat-top"><span>{s.label}</span><span className={`icon-tile ${s.color}`}><s.icon size={18} /></span></div><strong>{s.value}<small>{s.label === "待办事项" ? "项" : "条"}</small></strong><p>{s.caption}</p></button>)}</div>
            <section className="quick-section"><div className="section-title"><h2>随手开始</h2><span>给想法一个落点</span></div><div className="quick-grid">{[{ kind: "note", title: "写一份笔记", text: "思考、灵感与知识", icon: NotebookPen, color: "blue" }, { kind: "task", title: "添加待办", text: "让下一步更清晰", icon: CheckSquare2, color: "green" }, { kind: "bookmark", title: "收藏一个网页", text: "保存值得再看的内容", icon: Bookmark, color: "purple" }, { kind: "file", title: "上传文件", text: "把资料妥善收好", icon: Upload, color: "orange" }].map(q => <button key={q.kind} className="quick-card" onClick={() => create(q.kind as Kind)}><span className={`icon-tile ${q.color}`}><q.icon size={20} /></span><span><strong>{q.title}</strong><small>{q.text}</small></span><Plus size={15} /></button>)}</div></section>
            <div className="overview-columns"><div className="overview-left"><section className="panel"><div className="panel-heading"><h2><Clock3 size={17} /> 最近内容</h2><button className="text-button" onClick={() => navigate("note")}>我的笔记 <ArrowRight size={14} /></button></div>{data.items.length ? <div className="recent-list">{data.items.slice(0, 6).map(r => <button key={r.id} className="recent-row" onClick={() => setEditor({ kind: r.kind, item: r })}><span className={`icon-tile ${moduleFor(r.kind).color}`}>{(() => { const Icon = moduleFor(r.kind).icon; return <Icon size={17} />; })()}</span><span><strong>{r.title}</strong><small>{moduleFor(r.kind).name}{r.tags.length ? ` · ${r.tags.slice(0, 2).join(" / ")}` : ""}</small></span><time>{formatDate(r.updatedAt)}</time><ChevronRight size={14} /></button>)}</div> : <div className="welcome-empty"><div className="empty-illustration"><FileText size={32} /><span><Plus size={13} /></span></div><h3>从第一条记录开始</h3><p>一段想法、一份资料，或者今天要做的事。<br />它们会在这里，慢慢组成你的空间。</p><button className="button secondary" onClick={() => create("note")}><Plus size={15} /> 写下第一份笔记</button></div>}</section><section className="guide-strip"><span className="guide-logo"><ShieldCheck size={22} /></span><div><strong>安心记录，自在整理。</strong><p>所有模块共享搜索、标签、星标与回收站。</p></div><button onClick={() => navigate("settings")} aria-label="查看空间设置"><ArrowUpRight size={20} /></button></section></div>
              <div className="overview-right"><section className="panel"><div className="panel-heading"><h2><CheckSquare2 size={17} /> 接下来要做</h2><button className="icon-button" onClick={() => create("task")} aria-label="添加待办"><Plus size={17} /></button></div>{data.dueTasks.length ? <div className="task-preview">{data.dueTasks.map(t => <div className="task-preview-row" key={t.id}><button className="task-check" disabled={busy} onClick={() => void mutate(t, { status: "done" })} aria-label={`完成 ${t.title}`} /><button onClick={() => setEditor({ kind: "task", item: t })}><strong>{t.title}</strong><small className={t.dueAt && t.dueAt.slice(0, 10) < localDate() ? "overdue" : ""}>{t.dueAt ? formatDate(t.dueAt) : "未设置日期"}{t.meta.priority === "high" ? " · 高优先级" : ""}</small></button></div>)}</div> : <div className="small-empty"><CheckCircle2 size={27} /><strong>此刻，没有待办</strong><p>留一点从容，也可以安排下一步。</p><button className="text-button" onClick={() => create("task")}>添加一件事 <Plus size={14} /></button></div>}<button className="panel-bottom" onClick={() => navigate("task")}>查看全部待办 <ArrowRight size={14} /></button></section><section className="panel upcoming"><div className="panel-heading"><h2><CalendarDays size={17} /> 近期日程</h2><button className="icon-button" onClick={() => navigate("event")} aria-label="打开日历"><ArrowUpRight size={16} /></button></div>{data.upcoming.length ? data.upcoming.map(e => <button key={e.id} className="event-preview" onClick={() => setEditor({ kind: "event", item: e })}><span className="event-day">{new Date(e.dueAt!).getDate()}<small>{new Date(e.dueAt!).getMonth() + 1} 月</small></span><span><strong>{e.title}</strong><small>{String(e.meta.time || "全天")}{e.meta.place ? ` · ${e.meta.place}` : ""}</small></span></button>) : <div className="upcoming-empty"><p>日程留白，时间由你安排。</p><button onClick={() => create("event")}>安排一个日程 <ArrowRight size={13} /></button></div>}</section></div></div>
          </> : view === "settings" && !activeSearch ? <SettingsPanel preferences={data.preferences} user={user} notify={setToast} onSaved={p => setData(d => ({ ...d, preferences: p }))} onActivity={() => navigate("activity")} />
          : view === "activity" && !activeSearch ? <section className="panel activity-panel"><ActivityList rows={data.activity} /></section>
          : <>
            {view === "expense" && !activeSearch && <div className="ledger-summary">{["in", "out"].map(dir => <div className="panel" key={dir}><span>当前列表{dir === "in" ? "收入" : "支出"}</span><strong className={dir === "in" ? "positive" : ""}>¥ {visible.filter(r => r.meta.direction === dir).reduce((s, r) => s + Number(r.meta.amount || 0), 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>)}<div className="panel"><span>当前列表结余</span><strong>¥ {visible.reduce((s, r) => s + (r.meta.direction === "in" ? 1 : -1) * Number(r.meta.amount || 0), 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div></div>}
            <div className="content-toolbar"><div className="filter-tabs"><button className={status === "all" ? "selected" : ""} onClick={() => setStatus("all")}>全部内容 <span>{data.items.length}</span></button>{["task", "project"].includes(view) && <><button className={status === "active" ? "selected" : ""} onClick={() => setStatus("active")}>进行中</button><button className={status === "done" ? "selected" : ""} onClick={() => setStatus("done")}>已完成</button></>}</div><div className="toolbar-right">{tags.length > 0 && <label className="tag-filter"><Tag size={14} /><select aria-label="按标签筛选" value={tag} onChange={e => setTag(e.target.value)}><option value="">全部标签</option>{tags.map(t => <option key={t}>{t}</option>)}</select></label>}{view !== "event" && <div className="view-toggle"><button className={grid ? "selected" : ""} onClick={() => setGrid(true)} aria-label="卡片视图"><Grid2X2 size={16} /></button><button className={!grid ? "selected" : ""} onClick={() => setGrid(false)} aria-label="列表视图"><List size={17} /></button></div>}</div></div>
            {view === "event" && !activeSearch ? <CalendarView items={visible} weekStartsMonday={data.preferences.weekStartsMonday} onOpen={item => setEditor({ kind: item.kind, item })} onCreate={date => create("event", date)} />
            : visible.length ? <div className={grid ? "record-grid" : "record-list"}>{visible.map(r => <RecordCard key={r.id} item={r} list={!grid} busy={busy} onOpen={() => setEditor({ kind: r.kind, item: r })} onFavorite={() => void mutate(r, { favorite: !r.favorite })} onToggle={() => void mutate(r, { status: r.status === "done" ? "active" : "done" })} onRestore={() => void mutate(r, { action: "restore" })} onDelete={() => setConfirmDelete(r)} />)}</div>
            : <section className="panel big-empty"><current.icon size={38} /><h2>{activeSearch ? "没有找到匹配内容" : view === "trash" ? "回收站是空的" : view === "favorites" ? "把重要的内容加上星标" : view === "archive" ? "还没有归档内容" : `还没有${current.name}`}</h2><p>{activeSearch ? "换个关键词，或尝试搜索标签。" : view === "trash" ? "删除的内容会先保留在这里，方便恢复。" : view === "favorites" ? "点击内容卡片上的星星，即可在这里快速找到。" : view === "archive" ? "编辑内容时，可以把暂时告一段落的内容归档。" : current.description}</p>{!["trash", "favorites", "archive"].includes(view) && !activeSearch && <button className="button primary" onClick={emptyAction}><Plus size={16} />{view === "photo" ? "上传照片" : view === "file" ? "上传文件" : "创建第一条内容"}</button>}</section>}
          </>}
          {data.nextCursor && view !== "settings" && view !== "activity" && <div className="load-more"><button className="button secondary" onClick={() => void reload(true)}>加载更多内容 <ChevronRight size={15} /></button><small>每次加载 200 条，可持续查阅；搜索会直接查找全部记录。</small></div>}
        </>}
        <footer className="workspace-footer"><span><span className="online-dot" /> {error ? "连接需要重试" : loading ? "正在连接" : "空间已连接"}</span><span>隐序 · 为自己保留一方空间</span><button onClick={() => navigate("activity")}>操作记录 <ArrowUpRight size={12} /></button></footer>
      </main>
    </div>

    <input ref={uploadRef} type="file" multiple hidden onChange={e => void uploadFiles(e.target.files)} />
    {uploading && <div className="upload-progress" role="status"><Loader2 className="spin" size={17} />{uploading}</div>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast("")} aria-label="关闭提示"><X size={15} /></button></div>}
    {chooser && <Modal title="为你的空间添加内容" subtitle="选择一种方式，留住此刻。" onClose={() => setChooser(false)}><div className="create-grid">{modules.slice(1).map(m => <button key={m.id} onClick={() => create(m.id as Kind)}><span className={`icon-tile ${m.color}`}><m.icon size={21} /></span><strong>{m.name}</strong><small>{m.id === "file" || m.id === "photo" ? "上传到私人空间" : m.id === "inbox" ? "快速捕捉，稍后整理" : `新建${m.name}`}</small></button>)}</div></Modal>}
    {editor && <Editor key={editor.item?.id || editor.kind + (editor.date || "")} kind={editor.kind} item={editor.item} date={editor.date} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await reload(); setToast("内容已保存"); }} onTrash={async item => { await api("/api/space", { method: "PATCH", body: JSON.stringify({ id: item.id, version: item.version, action: "trash" }) }); setEditor(null); await reload(); setToast("已移入回收站，可以随时恢复"); }} />}
    {confirmDelete && <Modal title="彻底删除这条内容？" subtitle={`「${confirmDelete.title}」的当前内容、历史版本和附件将被删除，无法恢复。`} onClose={() => setConfirmDelete(null)}><div className="confirm-actions"><button className="button secondary" onClick={() => setConfirmDelete(null)}>取消</button><button className="button danger" disabled={busy} onClick={async () => { setBusy(true); try { const result = await api("/api/space", { method: "DELETE", body: JSON.stringify({ id: confirmDelete.id, version: confirmDelete.version }) }); setConfirmDelete(null); await reload(); setToast(result.cleanupPending ? "记录已删除，附件清理待重试，可在空间设置中继续" : "内容已彻底删除"); } catch (e) { notifyError(e); } finally { setBusy(false); } }}>{busy && <Loader2 size={14} className="spin" />}彻底删除</button></div></Modal>}
  </div>;
}

function NavItem({ m, active, count, onClick }: { m: Module; active: boolean; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><m.icon size={17} /><span>{m.name}</span>{count !== undefined && <small>{count}</small>}{active && <i />}</button>;
}

