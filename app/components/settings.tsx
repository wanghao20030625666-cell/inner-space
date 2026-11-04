"use client";
import { useRef, useState, type FormEvent } from "react";
import { Settings2, ShieldCheck, Check, Upload, Download, RefreshCw, Sun, Moon, LogOut, Loader2, ArrowRight, UserRound } from "lucide-react";
import { localDate, recordInput, type Preferences, type SpaceRecord, type Collection } from "../lib/model";
import { api, type Data } from "../lib/client";

function downloadJson(value: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
type Props = { preferences: Preferences; collections: Collection[]; user: { name: string; email: string }; notify: (text: string) => void; onSaved: (p: Preferences) => void; onImported: () => Promise<void>; onActivity: () => void };
export default function SettingsPanel({ preferences, collections, user, notify, onSaved, onImported, onActivity }: Props) {
  const [form, setForm] = useState(preferences), [busy, setBusy] = useState(false), [progress, setProgress] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  async function save(e: FormEvent) { e.preventDefault(); setBusy(true); try { const r = await api<{ preferences: Preferences }>("/api/preferences", { method: "PUT", body: JSON.stringify(form) }); onSaved(r.preferences); notify("设置已保存"); } catch (e) { notify(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); } }
  async function exportData() {
    setBusy(true); try {
      const records: SpaceRecord[] = [];
      for (const scope of ["all", "trash"]) { let cursor: string | null = null; do { const p = new URLSearchParams({ scope }); if (cursor) p.set("cursor", cursor); const r = await api<Data>(`/api/space?${p}`); records.push(...r.items); cursor = r.nextCursor; } while (cursor); }
      downloadJson({ format: "inner-space-v2", exportedAt: new Date().toISOString(), preferences, collections, records }, `隐序-记录备份-${localDate()}.json`);
      notify(`已导出 ${records.length} 条记录和 ${collections.length} 个专题；附件原文件请单独下载`);
    } catch (e) { notify(e instanceof Error ? e.message : "导出失败"); } finally { setBusy(false); }
  }
  /** Validate the text payload first, then remap collection/project IDs on import. */
  async function importData(file?: File) {
    if (!file) return; setBusy(true); let done = 0, groups = 0, skipped = 0;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("导入文件不能超过 10 MB");
      const value = JSON.parse(await file.text());
      if (!["inner-space-v1", "inner-space-v2"].includes(value.format) || !Array.isArray(value.records) || value.records.length > 1000) throw new Error("请选择隐序导出的 JSON 文件，一次最多导入 1000 条记录");
      const incoming = [];
      for (const r of value.records) {
        if (r && (["file", "photo"].includes(r.kind) || r.deletedAt)) { skipped++; continue; }
        const parsed = recordInput.safeParse({ ...r, collectionId: null, ...(r?.kind === "task" ? { meta: { ...r.meta, projectId: "" } } : {}) });
        if (!parsed.success) throw new Error(`备份包含无效记录：${parsed.error.issues[0].message}`);
        incoming.push({ source: r, value: parsed.data });
      }
      const sourceGroups = Array.isArray(value.collections) ? value.collections : [];
      if (sourceGroups.length > 100 || sourceGroups.some((g: Collection) => !g || typeof g.name !== "string" || !g.name.trim() || g.name.length > 40)) throw new Error("专题数据无效");
      const groupMap = new Map<string, string>(), projectMap = new Map<string, string>();
      for (const c of sourceGroups) { setProgress(`正在导入专题 ${groups + 1}/${sourceGroups.length}`); const r = await api<{ collection: Collection }>("/api/collections", { method: "POST", body: JSON.stringify({ name: c.name, color: ["green", "clay", "blue", "purple", "gray"].includes(c.color) ? c.color : "green" }) }); groupMap.set(c.id, r.collection.id); groups++; }
      incoming.sort((a, b) => (a.value.kind === "project" ? 0 : 1) - (b.value.kind === "project" ? 0 : 1));
      for (const r of incoming) { setProgress(`正在导入记录 ${done + 1}/${incoming.length}`); const payload = { ...r.value, collectionId: groupMap.get(r.source.collectionId) || null, meta: r.value.kind === "task" ? { ...r.value.meta, projectId: projectMap.get(r.source.meta?.projectId) || "" } : r.value.meta }; const saved = await api<{ item: SpaceRecord }>("/api/space", { method: "POST", body: JSON.stringify(payload) }); if (r.value.kind === "project") projectMap.set(r.source.id, saved.item.id); done++; }
      notify(`已导入 ${done} 条记录、${groups} 个专题，跳过 ${skipped} 条附件或回收站记录`);
    } catch (e) { notify(`已导入 ${done} 条记录、${groups} 个专题。${e instanceof Error ? e.message : "后续导入失败"}`); }
    finally { setBusy(false); setProgress(""); if (importRef.current) importRef.current.value = ""; if (done || groups) await onImported(); }
  }
  return <div className="settings-layout"><form className="panel settings-card" onSubmit={save}><div className="settings-title"><Settings2 size={20} /><div><h2>空间与外观</h2><p>名称、主页备注和显示习惯。</p></div></div><label className="field">空间名称<input value={form.name} required maxLength={30} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label className="field">主页备注 <span className="field-hint">可留空，显示在主页标题下方</span><textarea rows={2} maxLength={120} value={form.motto} placeholder="可填写自己的工作安排或一句备忘" onChange={e => setForm({ ...form, motto: e.target.value })} /></label><div className="field">外观<div className="theme-options"><button type="button" className={form.theme === "light" ? "selected" : ""} onClick={() => setForm({ ...form, theme: "light" })}><Sun size={20} />浅色</button><button type="button" className={form.theme === "dark" ? "selected" : ""} onClick={() => setForm({ ...form, theme: "dark" })}><Moon size={20} />深色</button></div></div><label className="checkbox-field"><input type="checkbox" checked={form.weekStartsMonday} onChange={e => setForm({ ...form, weekStartsMonday: e.target.checked })} />日历从星期一开始</label><button className="button primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}保存设置</button></form><div className="settings-side"><section className="panel settings-card"><div className="settings-title"><UserRound size={21} /><div><h2>账户</h2><p>记录和附件按登录账户独立保存。</p></div></div><div className="account-detail"><span>当前账户</span><strong>{user.email}</strong></div><div className="account-detail"><span>数据访问</span><strong><ShieldCheck size={14} />接口检查登录身份和记录归属</strong></div><p className="settings-explanation">站点入口的公开或私密范围由托管平台设置；此处的账户隔离不等同于端到端加密。</p><a className="button secondary" href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={15} />退出登录</a></section><section className="panel settings-card"><div className="settings-title"><Download size={20} /><div><h2>数据管理</h2><p>导出自己的记录，或从已有备份导入。</p></div></div><div className="data-action"><div><strong>导出记录与专题</strong><p>包含正文、标签、专题、设置和附件索引。附件原文件、历史版本与操作日志需要另行保留。</p></div><button className="button secondary small" disabled={busy} onClick={() => void exportData()}><Download size={14} />导出</button></div><div className="data-action"><div><strong>导入备份</strong><p>支持 v1 / v2，追加文字记录；v2 会重建专题和项目关联。重复导入会新增副本，附件和回收站内容会跳过。</p></div><button className="button secondary small" disabled={busy} onClick={() => importRef.current?.click()}><Upload size={14} />导入</button></div>{progress && <p className="import-progress" role="status">{progress}</p>}<input type="file" ref={importRef} hidden accept="application/json,.json" onChange={e => void importData(e.target.files?.[0])} /><div className="data-action"><div><strong>附件删除重试</strong><p>清理之前已彻底删除、但附件尚未删除成功的记录。</p></div><button className="button secondary small" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ pending: number }>("/api/cleanup", { method: "POST" }); notify(r.pending ? `还有 ${r.pending} 份附件待清理` : "附件清理完成"); } catch (e) { notify(e instanceof Error ? e.message : "清理失败"); } finally { setBusy(false); } }}><RefreshCw size={14} />重试</button></div><button className="text-button" onClick={onActivity}>查看操作记录<ArrowRight size={14} /></button></section></div></div>;
}
