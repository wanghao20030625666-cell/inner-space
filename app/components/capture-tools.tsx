"use client";
import { useEffect, useState } from "react";
import { Bookmark, Copy, Check } from "lucide-react";
import { bookmarklet, captureHash } from "../lib/capture";
/** Build the bookmark only from the current Site origin; copy is initiated by the user. */
export default function CaptureTools() {
  const [origin, setOrigin] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  const code = origin ? bookmarklet(origin) : "";
  return (
    <section className="panel settings-card">
      <div className="settings-title">
        <Bookmark size={20} />
        <div>
          <h2>快捷收集</h2>
          <p>在其他网页点击书签，带入标题和地址后确认保存。</p>
        </div>
      </div>
      <p className="settings-explanation">
        在浏览器新建书签，名称填“存到隐序”，网址粘贴下面代码。部分浏览器可将下方按钮拖到书签栏。只带入网页标题和网址，不读取正文。
      </p>
      <button
        type="button"
        className="button secondary"
        draggable={!!code}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/uri-list", code);
          e.dataTransfer.setData("text/plain", code);
        }}
      >
        存到隐序
      </button>
      <button
        className="button secondary settings-check"
        disabled={!code}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setStatus("代码已复制，请粘贴到书签网址");
          } catch {
            setStatus("复制失败，可手动选择下方代码");
          }
        }}
      >
        <Copy size={14} />
        复制书签代码
      </button>
      <textarea
        className="bookmarklet-code"
        aria-label="快捷收藏书签代码"
        rows={3}
        readOnly
        value={code}
      />
      <a
        className="text-button"
        href={
          origin
            ? `${origin}/capture${captureHash({ kind: "note", title: "", content: "" })}`
            : undefined
        }
      >
        打开快捷笔记入口
      </a>
      {status && (
        <p className="field-hint" role="status">
          <Check size={13} />
          {status}
        </p>
      )}
    </section>
  );
}
