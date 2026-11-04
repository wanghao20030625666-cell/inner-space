import { authorize, bucket, failure, ownedRecord, ApiError } from "../../../lib/server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await authorize(request), { id } = await context.params, item = await ownedRecord(owner, id);
    if (item.deletedAt || !["file", "photo"].includes(item.kind) || item.meta.key !== `${owner}/${item.id}`) throw new ApiError(404, "文件不存在");
    const object = await bucket().get(item.meta.key); if (!object) throw new ApiError(404, "文件不可用");
    const inline = item.kind === "photo" && ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(String(item.meta.mime));
    return new Response(object.body, { headers: { "Content-Type": String(item.meta.mime || "application/octet-stream"), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(item.meta.filename || item.title))}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Length": String(object.size), "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" } });
  } catch (e) { return failure(e); }
}
