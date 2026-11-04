export type CloseChoice = "keep" | "discard" | "continue";
/** A failed save/delete leaves the editor open; no React state snapshot decides success. */
export async function completeEditorClose(
  choice: CloseChoice,
  actions: {
    flush: () => Promise<boolean>;
    discard: (closing: boolean) => Promise<void>;
    close: () => void;
  },
) {
  if (choice === "continue") return;
  if (choice === "keep") {
    if (!(await actions.flush()))
      throw new Error("草稿未能保存到服务端，编辑窗口已保留。请重试，或复制内容后再处理。");
  } else await actions.discard(true);
  actions.close();
}
