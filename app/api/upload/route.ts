import { authorize, bucket, createRecord, failure, json, ApiError } from "../../lib/server";
const MAX_BYTES = 25 * 1024 * 1024;
/** Only signature-checked raster images render inline; other files download. */
function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return "image/png";
  const text = new TextDecoder().decode(bytes.slice(0, 16));
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return "image/gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}
export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const owner = await authorize(request);
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 100000)
      throw new ApiError(413, "单个文件不能超过 25 MB");
    const form = await request.formData(),
      file = form.get("file"),
      kind = form.get("kind") === "photo" ? "photo" : "file";
    if (!(file instanceof File) || !file.size) throw new ApiError(400, "请选择有效文件");
    if (file.size > MAX_BYTES) throw new ApiError(413, "单个文件不能超过 25 MB");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      mime = imageType(bytes);
    if (kind === "photo" && !mime) throw new ApiError(400, "相册支持 JPG、PNG、GIF 和 WebP 图片");
    const id = crypto.randomUUID(),
      key = `${owner}/${id}`;
    await bucket().put(key, bytes, {
      httpMetadata: { contentType: mime || "application/octet-stream" },
    });
    uploadedKey = key;
    const collectionId =
        typeof form.get("collectionId") === "string" ? String(form.get("collectionId")) : null,
      parentId = typeof form.get("parentId") === "string" ? String(form.get("parentId")) : "";
    const item = await createRecord(
      owner,
      {
        kind,
        title: file.name.slice(0, 160),
        content: "",
        tags: [],
        favorite: false,
        pinned: false,
        collectionId: collectionId || null,
        status: "active",
        dueAt: null,
        meta: {
          key,
          size: file.size,
          mime: mime || "application/octet-stream",
          filename: file.name.slice(0, 200),
          ...(parentId ? { parentId } : {}),
        },
      },
      id,
    );
    return json({ item }, 201);
  } catch (e) {
    if (uploadedKey) {
      try {
        await bucket().delete(uploadedKey);
      } catch {
        /* Preserve the original error. */
      }
    }
    return failure(e);
  }
}
