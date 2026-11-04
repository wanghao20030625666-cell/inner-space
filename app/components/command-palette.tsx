"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Search, Plus, FileText } from "lucide-react";
import Modal from "./modal";
import { api, type Data } from "../lib/client";
import { moduleFor } from "../lib/catalog";
import { recordSearchPath, spaceCommands } from "../lib/commands";
import type { Collection, Kind, SpaceRecord, View } from "../lib/model";
/** Debounced cross-module results reject stale responses and support arrow/Enter navigation. */
export default function CommandPalette({
  collections,
  onClose,
  onNavigate,
  onCreate,
  onOpen,
}: {
  collections: Collection[];
  onClose: () => void;
  onNavigate: (view: View, collection?: string) => void;
  onCreate: (kind: Kind) => void;
  onOpen: (item: SpaceRecord) => void;
}) {
  const [query, setQuery] = useState(""),
    [records, setRecords] = useState<SpaceRecord[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [active, setActive] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setRecords([]);
    setError("");
    setActive(0);
    setLoading(!!query.trim());
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void api<Data>(recordSearchPath(query), { signal: abort.signal })
        .then((r) => {
          if (!abort.signal.aborted) setRecords(r.items.slice(0, 20));
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "搜索失败");
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  const options = [
    ...spaceCommands(query, collections).map((c) => ({
      id: c.id,
      label: c.label,
      detail: c.detail,
      icon: c.action === "create" ? Plus : ArrowUpRight,
      run: () => (c.action === "create" ? onCreate(c.kind) : onNavigate(c.view, c.collection)),
    })),
    ...records.map((r) => ({
      id: r.id,
      label: r.title,
      detail: `${moduleFor(r.kind).name} · ${r.content.slice(0, 60) || "无正文"}`,
      icon: FileText,
      run: () => onOpen(r),
    })),
  ];
  const index = Math.min(active, Math.max(0, options.length - 1));
  const activeId = options[index]?.id;
  useEffect(() => {
    if (activeId)
      document.getElementById(`command-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);
  function choose(i: number) {
    const option = options[i];
    if (option) {
      onClose();
      option.run();
    }
  }
  return (
    <Modal title="搜索与命令" subtitle="查找记录、切换模块，或直接新建内容。" onClose={onClose}>
      <div className="command-palette">
        <div className="command-input">
          <Search size={18} />
          <input
            autoFocus
            aria-label="搜索记录或命令"
            role="combobox"
            aria-expanded="true"
            aria-controls="space-command-options"
            aria-activedescendant={options.length ? `command-${options[index].id}` : undefined}
            placeholder="输入内容、模块名称或“新建”…"
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                setActive((i) =>
                  options.length
                    ? (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length
                    : 0,
                );
              }
              if (e.key === "Enter") {
                e.preventDefault();
                choose(index);
              }
            }}
          />
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div
          id="space-command-options"
          role="listbox"
          aria-label="命令与搜索结果"
          className="command-options"
        >
          {options.map((option, i) => (
            <button
              key={option.id}
              id={`command-${option.id}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <option.icon size={16} />
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
        </div>
        <p className="command-help" role="status">
          {loading
            ? "正在搜索记录…"
            : !options.length
              ? "没有匹配项，换个关键词试试。"
              : "↑ ↓ 选择 · Enter 打开 · Esc 关闭；记录搜索不包含归档和回收站。"}
        </p>
      </div>
    </Modal>
  );
}
