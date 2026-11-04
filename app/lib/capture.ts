import { safeLink, type Kind } from "./model";
export type CaptureRequest = {
  kind: "note" | "inbox" | "bookmark";
  title: string;
  content: string;
  url?: string;
};
/** Only an explicit, bounded hash protocol is interpreted; it never performs a write. */
export function readCaptureHash(hash: string): CaptureRequest | null {
  if (!hash.startsWith("#capture?") || hash.length > 16000) return null;
  const p = new URLSearchParams(hash.slice(9)),
    kind = p.get("kind") || "bookmark";
  if (!["note", "inbox", "bookmark"].includes(kind)) return null;
  const url = kind === "bookmark" ? safeLink(p.get("url")) : undefined;
  if (kind === "bookmark" && (!url || url.length > 4000)) return null;
  return {
    kind: kind as CaptureRequest["kind"],
    title: (p.get("title") || (url ? new URL(url).hostname : "快捷记录")).trim().slice(0, 160),
    content: (p.get("text") || "").slice(0, 4000),
    ...(url ? { url } : {}),
  };
}
export function captureHash(value: CaptureRequest) {
  return (
    "#capture?" +
    new URLSearchParams({
      kind: value.kind,
      title: value.title,
      text: value.content,
      ...(value.url ? { url: value.url } : {}),
    })
  );
}
/** Only title and URL are passed; no page body, clipboard read or remote scraping is involved. */
export function bookmarklet(origin: string) {
  const target = new URL(origin);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("网站地址无效");
  return `javascript:(()=>{const p=new URLSearchParams({kind:'bookmark',url:location.href,title:document.title});window.open(${JSON.stringify(target.origin + "/capture#capture?")}+p.toString(),'_blank','noopener,noreferrer')})()`;
}
export type EditorSeed = {
  title?: string;
  content?: string;
  meta?: Record<string, string | number>;
  dueAt?: string;
};
export function captureSeed(value: CaptureRequest): { kind: Kind; seed: EditorSeed } {
  return {
    kind: value.kind,
    seed: {
      title: value.title,
      content: value.content,
      ...(value.url ? { meta: { url: value.url, readState: "unread" } } : {}),
    },
  };
}
