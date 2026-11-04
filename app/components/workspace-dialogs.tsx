"use client";
import { Check } from "lucide-react";
import Modal from "./modal";
import { lazy, Suspense, useState } from "react";
import ImageViewer from "./image-viewer";
import TrashDeleteDialog from "./trash-delete-dialog";
import { modules } from "../lib/catalog";
import { api, type Data } from "../lib/client";
import type { Kind, SpaceRecord, View } from "../lib/model";
import type { WorkspaceUi } from "../hooks/use-workspace-ui";
const Editor = lazy(() => import("./editor"));
/** Modal and confirmation flows are kept separate from navigation and list rendering. */
export default function WorkspaceDialogs({
  ui,
  data,
  busy,
  setBusy,
  setToast,
  collectionId,
  view,
  navigate,
  create,
  open,
  bulk,
  refreshCurrent,
  onRecordSaved,
}: {
  ui: WorkspaceUi;
  data: Data;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setToast: (value: string) => void;
  collectionId: string;
  view: View;
  navigate: (view: View, id?: string) => void;
  create: (kind: Kind, date?: string) => void;
  open: (item: SpaceRecord) => void;
  bulk: (changes: Record<string, unknown>) => Promise<void>;
  refreshCurrent: () => Promise<void>;
  onRecordSaved: (before: SpaceRecord | undefined, item: SpaceRecord) => Promise<void>;
}) {
  const {
    state: {
      editor,
      chooser,
      imageIndex,
      selected,
      deleteItem,
      bulkTrash,
      trashDelete,
      collectionEditor,
      collectionError,
    },
    setEditor,
    setChooser,
    setImageIndex,
    setDeleteItem,
    setBulkTrash,
    setTrashDelete,
    setCollectionEditor,
    setCollectionError,
  } = ui;
  const duplicateCollection =
    collectionEditor &&
    data.collections.some(
      (c) =>
        c.id !== collectionEditor.id &&
        c.name.trim().normalize("NFKC").toLocaleLowerCase() ===
          collectionEditor.name.trim().normalize("NFKC").toLocaleLowerCase(),
    );
  const [allowDuplicate, setAllowDuplicate] = useState<typeof collectionEditor>(null);
  const notifyError = (e: unknown) => setToast(e instanceof Error ? e.message : "操作未完成");
  async function saveCollection() {
    if (!collectionEditor) return;
    if (duplicateCollection && allowDuplicate !== collectionEditor) {
      setCollectionError("已有同名专题，请修改名称，或勾选仍然保存。");
      return;
    }
    setBusy(true);
    setCollectionError("");
    try {
      await api("/api/collections", {
        method: collectionEditor.id ? "PATCH" : "POST",
        body: JSON.stringify(collectionEditor),
      });
      setCollectionEditor(null);
      await refreshCurrent();
      setToast("专题已保存");
    } catch (e) {
      setCollectionError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {trashDelete && (
        <TrashDeleteDialog
          snapshot={trashDelete}
          onClose={() => setTrashDelete(null)}
          onFinished={refreshCurrent}
        />
      )}
      {imageIndex !== null && (
        <ImageViewer
          items={data.items.filter((r) => r.kind === "photo" && !r.deletedAt)}
          index={imageIndex}
          onIndex={setImageIndex}
          onClose={() => setImageIndex(null)}
          onEdit={open}
        />
      )}
      {chooser && (
        <Modal title="添加内容" subtitle="选择要保存的内容类型。" onClose={() => setChooser(false)}>
          <div className="create-grid">
            {modules.slice(1).map((m) => (
              <button key={m.id} onClick={() => create(m.id as Kind)}>
                <m.icon size={23} />
                <strong>{m.name}</strong>
                <small>
                  {m.id === "file" || m.id === "photo" ? "选择文件上传" : m.description}
                </small>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editor && (
        <Suspense
          fallback={
            <Modal title="正在打开编辑器" onClose={() => setEditor(null)}>
              <p className="lazy-loading" role="status">
                正在准备编辑内容…
              </p>
            </Modal>
          }
        >
          <Editor
            key={editor.item?.id || editor.draftKey || editor.kind + (editor.date || "")}
            kind={editor.kind}
            item={editor.item}
            date={editor.date}
            seed={editor.seed}
            draftKey={editor.draftKey}
            collections={data.collections}
            collectionId={collectionId === "none" ? null : collectionId || null}
            onClose={(refresh) => {
              setEditor(null);
              if (refresh || editor.kind === "project") void refreshCurrent();
            }}
            onSaved={async (item, notice, refresh) => {
              const previous = editor.item;
              setEditor(null);
              if (refresh || editor.kind === "project") await refreshCurrent();
              else await onRecordSaved(previous, item);
              setToast(notice || "已保存");
            }}
            onTrash={async (item) => {
              await api("/api/space", {
                method: "PATCH",
                body: JSON.stringify({ id: item.id, version: item.version, action: "trash" }),
              });
              setEditor(null);
              await refreshCurrent();
              setToast("已移入回收站");
            }}
          />
        </Suspense>
      )}
      {collectionEditor && (
        <Modal
          title={collectionEditor.id ? "编辑专题" : "新建专题"}
          subtitle="把同一件事相关的内容放在一起。"
          onClose={() => {
            if (!busy) setCollectionEditor(null);
          }}
        >
          <form
            className="collection-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveCollection();
            }}
          >
            <label className="field">
              专题名称
              <input
                required
                maxLength={40}
                autoFocus
                value={collectionEditor.name}
                onChange={(e) => setCollectionEditor({ ...collectionEditor, name: e.target.value })}
                placeholder="例如：家里装修、学习资料、旅行计划"
              />
            </label>
            <div className="field">
              标记颜色
              <div className="color-options">
                {["green", "clay", "blue", "purple", "gray"].map((color) => (
                  <button
                    type="button"
                    aria-label={`选择${color}颜色`}
                    className={`collection-dot ${color} ${collectionEditor.color === color ? "selected" : ""}`}
                    key={color}
                    onClick={() => setCollectionEditor({ ...collectionEditor, color })}
                  >
                    {collectionEditor.color === color && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>
            {duplicateCollection && (
              <label className="duplicate-warning">
                <input
                  type="checkbox"
                  checked={allowDuplicate === collectionEditor}
                  onChange={(e) => setAllowDuplicate(e.target.checked ? collectionEditor : null)}
                />
                已有同名专题，仍然保存这个名称
              </label>
            )}
            {collectionError && <p className="form-error">{collectionError}</p>}
            <div className="collection-form-actions">
              {collectionEditor.id && (
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() =>
                    setCollectionError("移除专题会保留内容。请点击下方“确认移除专题”完成。")
                  }
                >
                  移除专题
                </button>
              )}
              {collectionError.startsWith("移除专题") && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("/api/collections", {
                        method: "DELETE",
                        body: JSON.stringify({ id: collectionEditor.id }),
                      });
                      setCollectionEditor(null);
                      if (view === "collection") navigate("overview");
                      else await refreshCurrent();
                      setToast("专题已移除，内容已保留");
                    } catch (e) {
                      setCollectionError(e instanceof Error ? e.message : "移除失败");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  确认移除专题
                </button>
              )}
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? "保存中…" : "保存专题"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {bulkTrash && (
        <Modal
          title={`将 ${selected.length} 条内容移入回收站？`}
          subtitle="之后可以在回收站恢复。"
          onClose={() => setBulkTrash(false)}
        >
          <div className="confirm-actions">
            <button className="button secondary" onClick={() => setBulkTrash(false)}>
              取消
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void bulk({ action: "trash" })}
            >
              确认移入
            </button>
          </div>
        </Modal>
      )}
      {deleteItem && (
        <Modal
          title="彻底删除这条内容？"
          subtitle="内容及其历史版本无法恢复。单独保存的附件和相册图片按各自记录保留。"
          onClose={() => {
            if (!busy) setDeleteItem(null);
          }}
        >
          <p className="delete-record-title" title={deleteItem.title}>
            {deleteItem.title}
          </p>
          <div className="confirm-actions">
            <button className="button secondary" onClick={() => setDeleteItem(null)}>
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api("/api/space", {
                    method: "DELETE",
                    body: JSON.stringify({ id: deleteItem.id, version: deleteItem.version }),
                  });
                  setDeleteItem(null);
                  await refreshCurrent();
                  setToast(
                    r.cleanupPending ? "内容已删除，附件待清理，可在设置中重试" : "已彻底删除",
                  );
                } catch (e) {
                  notifyError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              彻底删除
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
