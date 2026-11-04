/** A Sites hostname must reach the trusted gateway; direct workers.dev hosts are rejected. */
export function isDirectWorkerRequest(url: string, host: string | null) {
  const blocked = (value: string) =>
    value.toLowerCase().replace(/\.$/, "").endsWith(".workers.dev") ||
    value.toLowerCase() === "workers.dev";
  try {
    if (blocked(new URL(url).hostname)) return true;
    if (host && blocked(new URL(`https://${host}`).hostname)) return true;
    return false;
  } catch {
    return true;
  }
}
