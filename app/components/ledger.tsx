"use client";
import LedgerTrend from "./ledger-trend";
import { Download } from "lucide-react";
import { useState } from "react";
import { allRecords, download, ledgerCSV, localDate } from "../lib/exports";
import type { LedgerData } from "../lib/client";
/** All filtered records contribute to these server-side cent-based totals. */
export default function Ledger({
  value,
  params,
  notify,
}: {
  value: LedgerData;
  params: URLSearchParams;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    money = (n: number) =>
      (n / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <>
      <div className="ledger-summary">
        {[
          { text: "收入", value: value.incomeCents, positive: true },
          { text: "支出", value: value.expenseCents, positive: false },
          {
            text: "结余",
            value: value.incomeCents - value.expenseCents,
            positive: value.incomeCents > value.expenseCents,
          },
        ].map((s) => (
          <div key={s.text}>
            <span>{s.text}</span>
            <strong className={s.positive ? "positive" : ""}>¥ {money(s.value)}</strong>
            <small>全部筛选结果 · {value.count} 笔</small>
          </div>
        ))}
      </div>
      <section className="panel ledger-trend-panel">
        <LedgerTrend months={value.months} />
      </section>
      <div className="ledger-details">
        <section className="panel">
          <div className="panel-heading">
            <h2>支出分类</h2>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  download(
                    ledgerCSV(await allRecords(params)),
                    `隐序-账本-${localDate()}.csv`,
                    "text/csv;charset=utf-8",
                  );
                  notify("已导出全部筛选结果");
                } catch (e) {
                  notify(e instanceof Error ? e.message : "导出失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download size={14} />
              {busy ? "正在导出…" : "导出 CSV"}
            </button>
          </div>
          <div className="category-bars">
            {value.categories.map((c) => (
              <div key={c.name}>
                <span>{c.name}</span>
                <progress max={Math.max(1, value.expenseCents)} value={c.cents} />
                <strong>¥ {money(c.cents)}</strong>
              </div>
            ))}
            {!value.categories.length && <p className="field-hint">还没有支出记录。</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>月度收支</h2>
            <span>最近 12 个有记录的月份</span>
          </div>
          <div className="monthly-ledger">
            <div>
              <span>月份</span>
              <span>收入</span>
              <span>支出</span>
            </div>
            {value.months.map((m) => (
              <div key={m.month}>
                <strong>{m.month}</strong>
                <span className="positive">{money(m.incomeCents)}</span>
                <span>{money(m.expenseCents)}</span>
              </div>
            ))}
            {!value.months.length && <p className="field-hint">记账后会显示在这里。</p>}
          </div>
        </section>
      </div>
    </>
  );
}
