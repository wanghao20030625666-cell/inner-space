"use client";
import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil } from "lucide-react";
import Modal from "./modal";
import type { SpaceRecord } from "../lib/model";
export default function ImageViewer({
  items,
  index,
  onIndex,
  onClose,
  onEdit,
}: {
  items: SpaceRecord[];
  index: number;
  onIndex: (n: number) => void;
  onClose: () => void;
  onEdit: (r: SpaceRecord) => void;
}) {
  const item = items[index];
  const move = useCallback(
    (by: number) => onIndex((index + by + items.length) % items.length),
    [index, items.length, onIndex],
  );
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
    };
    addEventListener("keydown", handle);
    return () => removeEventListener("keydown", handle);
  }, [move]);
  if (!item) return null;
  return (
    <Modal
      title={item.title}
      subtitle={`${index + 1} / ${items.length} · 使用左右方向键切换`}
      onClose={onClose}
      wide
    >
      <div className="image-lightbox">
        <img src={`/api/files/${item.id}`} alt={item.title} />
      </div>
      <div className="lightbox-actions">
        <button
          className="button secondary"
          disabled={items.length < 2}
          aria-label="上一张照片"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="button secondary"
          disabled={items.length < 2}
          aria-label="下一张照片"
          onClick={() => move(1)}
        >
          <ChevronRight size={18} />
        </button>
        <a
          className="button secondary"
          href={`/api/files/${item.id}`}
          download={String(item.meta.filename || item.title)}
        >
          <Download size={15} />
          下载原图
        </a>
        <button
          className="button primary"
          onClick={() => {
            onClose();
            onEdit(item);
          }}
        >
          <Pencil size={15} />
          编辑说明
        </button>
      </div>
    </Modal>
  );
}
