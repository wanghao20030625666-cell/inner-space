"use client";
import { useState, type FormEvent } from "react";
import {
  Settings2,
  ShieldCheck,
  Check,
  RefreshCw,
  Sun,
  Moon,
  LogOut,
  Loader2,
  ArrowRight,
  UserRound,
} from "lucide-react";
import { type Preferences } from "../lib/model";
import { api } from "../lib/client";

import DataTools from "./data-tools";
import type { Kind } from "../lib/model";
type Props = {
  preferences: Preferences;
  user: { name: string; email: string };
  notify: (text: string) => void;
  onSaved: (p: Preferences) => void;
  onImported: () => Promise<void>;
  onResume: (key: string, kind: Kind) => void;
  onActivity: () => void;
};
export default function SettingsPanel({
  preferences,
  user,
  notify,
  onSaved,
  onImported,
  onResume,
  onActivity,
}: Props) {
  const [form, setForm] = useState(preferences),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ preferences: Preferences }>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSaved(r.preferences);
      notify("设置已保存");
    } catch (e) {
      notify(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      <form className="panel settings-card" onSubmit={save}>
        <div className="settings-title">
          <Settings2 size={20} />
          <div>
            <h2>空间与外观</h2>
            <p>名称、主页备注和显示习惯。</p>
          </div>
        </div>
        <label className="field">
          空间名称
          <input
            value={form.name}
            required
            maxLength={30}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="field">
          主页备注 <span className="field-hint">可留空，显示在主页标题下方</span>
          <textarea
            rows={2}
            maxLength={120}
            value={form.motto}
            placeholder="可填写自己的工作安排或一句备忘"
            onChange={(e) => setForm({ ...form, motto: e.target.value })}
          />
        </label>
        <div className="field">
          外观
          <div className="theme-options">
            <button
              type="button"
              className={form.theme === "light" ? "selected" : ""}
              onClick={() => setForm({ ...form, theme: "light" })}
            >
              <Sun size={20} />
              浅色
            </button>
            <button
              type="button"
              className={form.theme === "dark" ? "selected" : ""}
              onClick={() => setForm({ ...form, theme: "dark" })}
            >
              <Moon size={20} />
              深色
            </button>
          </div>
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={form.weekStartsMonday}
            onChange={(e) => setForm({ ...form, weekStartsMonday: e.target.checked })}
          />
          日历从星期一开始
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}保存设置
        </button>
      </form>
      <div className="settings-side">
        <section className="panel settings-card">
          <div className="settings-title">
            <UserRound size={21} />
            <div>
              <h2>账户</h2>
              <p>记录和附件按登录账户独立保存。</p>
            </div>
          </div>
          <div className="account-detail">
            <span>当前账户</span>
            <strong>{user.email}</strong>
          </div>
          <div className="account-detail">
            <span>数据访问</span>
            <strong>
              <ShieldCheck size={14} />
              接口检查登录身份和记录归属
            </strong>
          </div>
          <p className="settings-explanation">
            站点入口的公开或私密范围由托管平台设置；此处的账户隔离不等同于端到端加密。
          </p>
          <a className="button secondary" href="/signout-with-chatgpt?return_to=%2F" target="_top">
            <LogOut size={15} />
            退出登录
          </a>
        </section>
        <DataTools notify={notify} onChanged={onImported} onResume={onResume} />
        <section className="panel settings-card">
          <div className="data-action">
            <div>
              <strong>附件删除重试</strong>
              <p>重试之前未能完成的附件清理。</p>
            </div>
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ pending: number }>("/api/cleanup", { method: "POST" });
                  notify(r.pending ? `还有 ${r.pending} 份附件待清理` : "附件清理完成");
                } catch (e) {
                  notify(e instanceof Error ? e.message : "清理失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={14} />
              重试
            </button>
          </div>
          <button type="button" className="text-button" onClick={onActivity}>
            查看全部操作记录
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </div>
  );
}
