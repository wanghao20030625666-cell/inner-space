const idPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const imagePattern = () =>
  new RegExp(`!\\[([^\\]\\n]{0,200})\\]\\(/api/files/(${idPattern})\\)`, "gi");
/** Images are restricted to protected, same-origin file IDs; external tracking URLs stay text. */
export function inlineImage(line: string) {
  const match = new RegExp(`^!\\[([^\\]\\n]{0,200})\\]\\(/api/files/(${idPattern})\\)$`, "i").exec(
    line,
  );
  return match ? { alt: match[1], id: match[2], src: `/api/files/${match[2]}` } : null;
}
export function imageIds(content: string) {
  return [...new Set([...content.matchAll(imagePattern())].map((m) => m[2]))];
}
export function imageMarkdown(id: string, title: string) {
  return `![${title.replace(/[\[\]\r\n]/g, " ").slice(0, 160)}](/api/files/${id})`;
}
/** Restore remaps all protected image references only after new attachment IDs are known. */
export function remapImages(content: string, ids: Map<string, string>, missingAsText = false) {
  return content.replace(imagePattern(), (full, alt, id) =>
    ids.has(id)
      ? imageMarkdown(ids.get(id)!, alt)
      : missingAsText
        ? `[图片未随备份恢复：${alt || "图片"}]`
        : full,
  );
}
