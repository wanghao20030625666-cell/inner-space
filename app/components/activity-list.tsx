"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity as ActivityIcon, Search } from "lucide-react";
import type { Activity } from "../lib/model";
import { api, formatTime } from "../lib/client";
/** Activity has its own search and cursor; it is not limited to the dashboard's 40 rows. */
export default function ActivityList() {
  const [rows, setRows] = useState<Activity[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    serial = useRef(0),
    cursorRef = useRef<string | null>(null);
  const invalidate = useCallback(() => {
    serial.current++;
  }, []);
  const load = useCallback(
    async (append = false) => {
      const id = ++serial.current;
      setBusy(true);
      setError("");
      try {
        const p = new URLSearchParams({ q: query });
        if (append && cursorRef.current) p.set("cursor", cursorRef.current);
        const r = await api<{ rows: Activity[]; nextCursor: string | null }>(`/api/activity?${p}`);
        if (serial.current === id) {
          setRows((prev) => (append ? [...prev, ...r.rows] : r.rows));
          setCursor(r.nextCursor);
          cursorRef.current = r.nextCursor;
        }
      } catch (e) {
        if (id === serial.current) setError(e instanceof Error ? e.message : "读取失败");
      } finally {
        if (id === serial.current) setBusy(false);
      }
    },
    [query],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [load, invalidate]);
  return (
    <div className="activity-list">
      <label className="activity-search">
        <Search size={15} />
        <input
          aria-label="搜索操作记录"
          value={query}
          placeholder="搜索内容名称或操作"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error">
          {error}
          <button onClick={() => void load()}>重试</button>
        </p>
      )}
      {rows.map((a) => (
        <div className="activity-row" key={a.id}>
          <span className="activity-dot" />
          <div>
            <strong>{a.action}</strong>
            <span>{a.title}</span>
          </div>
          <time>{formatTime(a.createdAt)}</time>
        </div>
      ))}
      {!rows.length && !busy && !error && (
        <div className="small-empty">
          <ActivityIcon size={30} />
          <p>没有符合条件的操作记录。</p>
        </div>
      )}
      {busy && <p className="field-hint">正在读取…</p>}
      {cursor && (
        <div className="load-more">
          <button className="button secondary" disabled={busy} onClick={() => void load(true)}>
            加载更早记录
          </button>
        </div>
      )}
    </div>
  );
}
