"use client";
import { useEffect, useState } from "react";
import { fileSize } from "../lib/client";
import type { SpaceRecord } from "../lib/model";
/** Only bounded text and signature-checked images render; active file content never executes. */
export default function FilePreview({ item }: { item: SpaceRecord }) {
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  const image = String(item.meta.mime).startsWith("image/"),
    safeText =
      /\.(txt|md|csv|json|log|yaml|yml)$/i.test(String(item.meta.filename || item.title)) &&
      Number(item.meta.size) <= 1024 * 1024;
  useEffect(() => {
    if (!safeText || item.deletedAt) return;
    const controller = new AbortController();
    fetch(`/api/files/${item.id}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setText(await r.text());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("文件预览读取失败，请下载查看");
      });
    return () => controller.abort();
  }, [item.id, safeText, item.deletedAt]);
  if (item.deletedAt) return null;
  return (
    <section className="file-preview">
      <div className="file-properties">
        <span>{String(item.meta.filename || item.title)}</span>
        <small>{fileSize(item.meta.size)}</small>
      </div>
      {image ? (
        <img src={`/api/files/${item.id}`} alt={item.title} />
      ) : safeText ? (
        <pre>{error || text || "正在读取预览…"}</pre>
      ) : (
        <p className="field-hint">此格式可下载到本机查看，正文可填写文件说明。</p>
      )}
    </section>
  );
}
