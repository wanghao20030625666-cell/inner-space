"use client";
import { Activity as ActivityIcon } from "lucide-react";
import type { Activity } from "../lib/model";
import { formatTime } from "../lib/client";
export default function ActivityList({ rows }: { rows: Activity[] }) {
  return rows.length ? <div className="activity-list">{rows.map(a => <div className="activity-row" key={a.id}><span className="activity-dot" /><div><strong>{a.action}</strong><span>{a.title}</span></div><time>{formatTime(a.createdAt)}</time></div>)}</div> : <div className="small-empty"><ActivityIcon size={30} /><p>开始使用后，内容操作会记录在这里。</p></div>;
}

