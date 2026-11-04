"use client";
import { useState } from "react";
import { monthlySeries, type MonthTotal } from "../lib/ledger-trend";
import { localDate } from "../lib/model";
/** Month buttons expose values on focus/click as well as hover, without a chart dependency. */
export default function LedgerTrend({ months, anchor }: { months: MonthTotal[]; anchor?: string }) {
  const rows = monthlySeries(months, anchor || months[0]?.month || localDate().slice(0, 7)),
    [selected, setSelected] = useState(5),
    active = rows[Math.min(selected, rows.length - 1)],
    max = Math.max(1, ...rows.flatMap((r) => [r.incomeCents, r.expenseCents])),
    money = (n: number) =>
      (n / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <figure className="ledger-trend">
      <figcaption>
        <strong>月度趋势</strong>
        <span>
          <i className="income" />
          收入
          <i className="expense" />
          支出
        </span>
      </figcaption>
      <div className="trend-columns">
        {rows.map((r, i) => (
          <button
            key={r.month}
            type="button"
            className={selected === i ? "selected" : ""}
            aria-pressed={selected === i}
            aria-label={`${r.month} 收入 ${money(r.incomeCents)} 元，支出 ${money(r.expenseCents)} 元`}
            onClick={() => setSelected(i)}
            onFocus={() => setSelected(i)}
            onMouseEnter={() => setSelected(i)}
          >
            <span className="trend-bars">
              <i className="income" style={{ height: `${(r.incomeCents / max) * 100}%` }} />
              <i className="expense" style={{ height: `${(r.expenseCents / max) * 100}%` }} />
            </span>
            <small>{r.month.slice(2)}</small>
          </button>
        ))}
      </div>
      <p className="trend-detail" aria-live="polite">
        <strong>{active.month}</strong>
        <span>收入 ¥ {money(active.incomeCents)}</span>
        <span>支出 ¥ {money(active.expenseCents)}</span>
      </p>
      <small className="trend-caption">连续六个自然月 · 空白月份按 0 计算</small>
    </figure>
  );
}
