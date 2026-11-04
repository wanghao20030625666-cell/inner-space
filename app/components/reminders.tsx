"use client";
import { useState } from "react";
import { CalendarClock, Plus, ArrowUpRight } from "lucide-react";
import { api, type Data } from "../lib/client";
import { reminderLabel, type Reminder } from "../lib/reminders";
import type { SpaceRecord } from "../lib/model";
/** One restrained card combines personal dates; these are in-site reminders, not background alerts. */
export default function Reminders({
  items,
  onOpen,
  onCreate,
}: {
  items: Reminder[];
  onOpen: (r: SpaceRecord) => void;
  onCreate: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  async function open(id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await api<Data>(`/api/space?id=${encodeURIComponent(id)}&scope=all&lite=1`);
      if (!r.items[0]) throw Error("内容已变化，请刷新主页");
      onOpen(r.items[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="panel reminders-panel">
      <div className="panel-heading">
        <h2>
          <CalendarClock size={16} />
          近期提醒
        </h2>
        <button className="text-button" onClick={onCreate}>
          <Plus size={13} />
          添加
        </button>
      </div>
      {!items.length && (
        <p className="reminder-empty">记录一个重要日子，或给联系人填写生日。到时会显示在这里。</p>
      )}
      {items.map((r) => (
        <button
          className={`reminder-row ${r.days < 0 ? "overdue" : ""}`}
          key={r.id}
          disabled={!!busy}
          onClick={() => void open(r.id)}
        >
          <span>
            <small>
              {reminderLabel[r.type]} · {r.date}
            </small>
            <strong>{r.title}</strong>
          </span>
          <b>{r.days === 0 ? "今天" : r.days < 0 ? `已过 ${-r.days} 天` : `还有 ${r.days} 天`}</b>
          <ArrowUpRight size={14} />
        </button>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="reminder-note">站内提醒；续费后请更新下次日期。</p>
    </section>
  );
}
