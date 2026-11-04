"use client";
import Modal from "./modal";
import type { CaptureRequest } from "../lib/capture";
/** URL parameters are untrusted input; require an explicit action before opening an autosaving editor. */
export default function CapturePrompt({
  value,
  onAccept,
  onClose,
}: {
  value: CaptureRequest;
  onAccept: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={value.kind === "bookmark" ? "保存这个网页？" : "带入快捷记录？"}
      subtitle="核对内容后再进入编辑器，正式保存由你决定。"
      onClose={onClose}
    >
      <div className="capture-prompt">
        <h3>{value.title || "未填写标题"}</h3>
        {value.url && <p className="capture-url">{value.url}</p>}
        {value.content && <pre>{value.content}</pre>}
        <div className="confirm-actions">
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" onClick={onAccept}>
            带入编辑器
          </button>
        </div>
      </div>
    </Modal>
  );
}
