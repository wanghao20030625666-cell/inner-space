"use client";
import { useEffect, useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { api, type Data } from "../lib/client";
import type { SpaceRecord } from "../lib/model";

export default function ProjectTasks({ project }: { project: SpaceRecord }) {
  const [items, setItems] = useState<SpaceRecord[]>([]), [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [total, setTotal] = useState(0), [done, setDone] = useState(0);
  async function load() { const r = await api<Data>(`/api/space?kind=task&project=${project.id}`); setItems(r.items); setTotal(r.total); setDone(r.projectTasks.find(p => p.projectId === project.id)?.done || 0); }
  useEffect(() => { load().catch(() => setError("关联待办加载失败")); }, [project.id]);
  async function create() { if (!title.trim()) return; setBusy(true); setError(""); try { await api("/api/space", { method: "POST", body: JSON.stringify({ kind: "task", title: title.trim(), collectionId: project.collectionId, meta: { projectId: project.id, stage: "todo" } }) }); setTitle(""); await load(); } catch (e) { setError(e instanceof Error ? e.message : "添加失败"); } finally { setBusy(false); } }
  return <section className="project-task-section"><div className="field-heading"><strong>项目待办</strong><span>{done} / {total} 项已完成{total > items.length ? "（显示最近 200 项）" : ""}</span></div><p className="field-hint">新增和勾选会立即保存，项目进度按关联待办计算。</p>
    {error && <p className="form-error">{error}</p>}
    <div className="project-task-list">{items.map(r => <label key={r.id}><button type="button" className={`task-check ${r.status === "done" ? "checked" : ""}`} aria-label={`${r.status === "done" ? "重开" : "完成"} ${r.title}`} disabled={busy} onClick={async () => { setBusy(true); try { await api("/api/space", { method: "PATCH", body: JSON.stringify({ id: r.id, version: r.version, status: r.status === "done" ? "active" : "done", meta: { ...r.meta, stage: r.status === "done" ? "todo" : "done" } }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "更新失败"); } finally { setBusy(false); } }}>{r.status === "done" && <Check size={12} />}</button><span className={r.status === "done" ? "struck" : ""}>{r.title}</span></label>)}</div>
    <div className="inline-task"><input aria-label="添加项目待办" placeholder="添加一个待办…" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void create(); } }} /><button type="button" className="button secondary" disabled={busy || !title.trim()} onClick={() => void create()}>{busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}添加</button></div>
  </section>;
}
