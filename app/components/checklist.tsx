"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
export type CheckItem = { id: string; text: string; done: boolean };
export function readChecklist(value: unknown): CheckItem[] {
  try {
    const list = JSON.parse(String(value || "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
/** Substeps stay in the task's versioned metadata and save with its editor. */
export default function Checklist({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(""),
    items = readChecklist(value);
  const change = (rows: CheckItem[]) => onChange(JSON.stringify(rows));
  const add = () => {
    if (text.trim() && items.length < 50) {
      change([...items, { id: crypto.randomUUID(), text: text.trim(), done: false }]);
      setText("");
    }
  };
  return (
    <section className="subchecklist">
      <div className="field-heading">
        <strong>子清单</strong>
        <span>
          {items.filter((r) => r.done).length}/{items.length} 项完成
        </span>
      </div>
      {items.map((r) => (
        <div className="checklist-row" key={r.id}>
          <input
            type="checkbox"
            aria-label={`完成子项 ${r.text}`}
            checked={r.done}
            disabled={disabled}
            onChange={(e) =>
              change(items.map((x) => (x.id === r.id ? { ...x, done: e.target.checked } : x)))
            }
          />
          <span className={r.done ? "struck" : ""}>{r.text}</span>
          <button
            type="button"
            aria-label={`移除子项 ${r.text}`}
            disabled={disabled}
            onClick={() => change(items.filter((x) => x.id !== r.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {!disabled && items.length < 50 && (
        <div className="inline-task">
          <input
            value={text}
            maxLength={120}
            aria-label="新增子清单内容"
            placeholder="把这件事拆成几步…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="button secondary" onClick={add} disabled={!text.trim()}>
            <Plus size={14} />
            添加
          </button>
        </div>
      )}
    </section>
  );
}
