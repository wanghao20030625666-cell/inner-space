"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { localDate, type SpaceRecord } from "../lib/model";
import { formatDate } from "../lib/client";
import { allRecords, download, ical } from "../lib/exports";
/** All pages in the visible six-week range are loaded; parent state preserves navigation after editing. */
export default function CalendarView({
  weekStartsMonday,
  onOpen,
  onCreate,
  month,
  onMonth,
  selected,
  onSelect,
}: {
  weekStartsMonday: boolean;
  onOpen: (r: SpaceRecord) => void;
  onCreate: (date: string) => void;
  month: string;
  onMonth: (month: string) => void;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [items, setItems] = useState<SpaceRecord[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [mode, setMode] = useState("month"),
    [retry, setRetry] = useState(0),
    d = new Date(month + "-01T12:00:00"),
    year = d.getFullYear(),
    number = d.getMonth(),
    offset = (new Date(year, number, 1).getDay() + (weekStartsMonday ? 6 : 0)) % 7,
    days = Array.from({ length: 42 }, (_, i) => new Date(year, number, i - offset + 1)),
    from = localDate(days[0]),
    to = localDate(days[41]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setItems([]);
    allRecords(
      new URLSearchParams({ kind: "event", from, to, scope: "active", lite: "1", sort: "due" }),
    )
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [from, to, retry]);
  const selectedItems = items
      .filter((r) => r.dueAt === selected)
      .sort((a, b) => String(a.meta.time || "").localeCompare(String(b.meta.time || ""))),
    weekdays = weekStartsMonday
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"],
    move = (by: number) => {
      const next = localDate(new Date(year, number + by, 1));
      onMonth(next.slice(0, 7));
      onSelect(next);
    };
  return (
    <div className="calendar-layout">
      <section className="panel calendar-panel">
        <div className="calendar-heading">
          <h2>
            {year} 年 {number + 1} 月
          </h2>
          <div>
            <button
              className="text-button"
              onClick={() => setMode(mode === "month" ? "agenda" : "month")}
            >
              {mode === "month" ? "日程列表" : "月历"}
            </button>
            <button
              className="icon-button"
              aria-label="导出当前月日程"
              disabled={busy}
              onClick={() =>
                download(
                  ical(items.filter((r) => r.dueAt?.startsWith(month))),
                  `隐序-日程-${month}.ics`,
                  "text/calendar;charset=utf-8",
                )
              }
            >
              <Download size={16} />
            </button>
            <button
              className="button secondary small"
              onClick={() => {
                onMonth(localDate().slice(0, 7));
                onSelect(localDate());
              }}
            >
              今天
            </button>
            <button className="icon-button" aria-label="上个月" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-button" aria-label="下个月" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setRetry((n) => n + 1)}>重试</button>
          </div>
        )}
        {busy && (
          <p className="calendar-loading" role="status">
            正在读取这个月的全部日程…
          </p>
        )}
        {mode === "month" ? (
          <div className="calendar-grid">
            {weekdays.map((w) => (
              <div className="weekday" key={w}>
                周{w}
              </div>
            ))}
            {days.map((day) => {
              const date = localDate(day),
                events = items.filter((r) => r.dueAt === date);
              return (
                <button
                  aria-label={`${date}，${events.length} 项日程`}
                  key={date}
                  className={`calendar-day ${day.getMonth() !== number ? "muted" : ""} ${date === selected ? "selected" : ""} ${date === localDate() ? "today" : ""}`}
                  onClick={() => onSelect(date)}
                >
                  <span>{day.getDate()}</span>
                  <div>
                    {events.slice(0, 2).map((r) => (
                      <small key={r.id} title={r.title}>
                        {r.title}
                      </small>
                    ))}
                    {events.length > 2 && <small>还有 {events.length - 2} 项</small>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="month-agenda">
            {items
              .filter((r) => r.dueAt?.startsWith(month))
              .map((r) => (
                <button className="agenda-item" key={r.id} onClick={() => onOpen(r)}>
                  <time>
                    {formatDate(r.dueAt)} · {String(r.meta.time || "全天")}
                    {r.meta.endTime ? `–${r.meta.endTime}` : ""}
                  </time>
                  <strong>{r.title}</strong>
                  <p>{String(r.meta.place || r.content.slice(0, 80))}</p>
                </button>
              ))}
            {!busy && !items.some((r) => r.dueAt?.startsWith(month)) && (
              <div className="small-empty">本月暂无日程</div>
            )}
          </div>
        )}
      </section>
      <section className="panel calendar-agenda">
        <div className="panel-heading">
          <h2>{formatDate(selected, true)}</h2>
          <button
            className="icon-button"
            aria-label="添加当日日程"
            onClick={() => onCreate(selected)}
          >
            <Plus size={18} />
          </button>
        </div>
        {selectedItems.length ? (
          selectedItems.map((r) => (
            <button
              className={`agenda-item ${r.status === "done" ? "struck" : ""}`}
              key={r.id}
              onClick={() => onOpen(r)}
            >
              <time>
                {String(r.meta.time || "全天")}
                {r.meta.endTime ? `–${r.meta.endTime}` : ""}
              </time>
              <strong>{r.title}</strong>
              <p>{String(r.meta.place || r.content.slice(0, 60) || "未添加备注")}</p>
            </button>
          ))
        ) : (
          <div className="small-empty">
            <CalendarDays size={28} />
            <p>{busy ? "正在读取…" : "这一天还没有安排"}</p>
            <button className="text-button" onClick={() => onCreate(selected)}>
              添加日程
              <Plus size={14} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
