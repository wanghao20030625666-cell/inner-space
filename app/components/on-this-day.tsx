"use client";
import { History, ArrowUpRight } from "lucide-react";
import type { SpaceRecord } from "../lib/model";
export default function OnThisDay({
  items,
  onOpen,
}: {
  items: SpaceRecord[];
  onOpen: (r: SpaceRecord) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="panel on-this-day">
      <header className="panel-heading">
        <h2>
          <History size={15} />
          那年今日
        </h2>
        <span>往年同一天的日记</span>
      </header>
      <div>
        {items.map((r) => (
          <button key={r.id} onClick={() => onOpen(r)}>
            <time>{r.dueAt}</time>
            <span>
              <strong>{r.title}</strong>
              <p>{r.content.replace(/[#*`>]/g, "").slice(0, 110) || "打开看看这一天的记录。"}</p>
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}
