import { api, type Data } from "./client";
import { localDate, type SpaceRecord } from "./model";

/** Browser downloads use a short-lived object URL, without uploading to a third party. */
export function download(value: BlobPart, name: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([value], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function allRecords(params = new URLSearchParams({ scope: "all" })) {
  const items: SpaceRecord[] = [],
    seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const p = new URLSearchParams(params);
    p.set("lite", "1");
    if (cursor) p.set("cursor", cursor);
    const result = await api<Data>(`/api/space?${p}`);
    items.push(...result.items);
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("列表在导出期间发生变化，请重新导出");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...new Map(items.map((r) => [r.id, r])).values()];
}
const escape = (value: unknown) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
export function vcard(r: SpaceRecord) {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${r.id}`,
    `FN:${escape(r.title)}`,
    `TEL:${escape(r.meta.phone)}`,
    `EMAIL:${escape(r.meta.email)}`,
    `ORG:${escape(r.meta.company)}`,
    `ADR:;;${escape(r.meta.address)};;;;`,
    `NOTE:${escape(r.content)}`,
    "END:VCARD",
    "",
  ].join("\r\n");
}
export function ical(records: SpaceRecord[]) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ""),
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Inner Space//Personal Calendar//ZH",
      "CALSCALE:GREGORIAN",
    ];
  for (const r of records.filter((r) => r.kind === "event" && r.dueAt && !r.deletedAt)) {
    const date = r.dueAt!.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@inner-space`,
      `DTSTAMP:${stamp}`,
      `SUMMARY:${escape(r.title)}`,
      `DESCRIPTION:${escape(r.content)}`,
      `LOCATION:${escape(r.meta.place)}`,
    );
    if (r.meta.time) {
      lines.push(`DTSTART:${date}T${String(r.meta.time).replace(":", "")}00`);
      if (r.meta.endTime) lines.push(`DTEND:${date}T${String(r.meta.endTime).replace(":", "")}00`);
    } else {
      const next = new Date(r.dueAt! + "T12:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(
        `DTSTART;VALUE=DATE:${date}`,
        `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`,
      );
    }
    lines.push("STATUS:CONFIRMED", `X-INNER-SPACE-STATUS:${r.status}`, "END:VEVENT");
  }
  return [...lines, "END:VCALENDAR", ""].join("\r\n");
}
// Protect spreadsheets from formulas embedded in user-controlled CSV fields.
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""') + '"';
}
export function ledgerCSV(records: SpaceRecord[]) {
  return (
    "\ufeff" +
    [
      ["日期", "标题", "收支", "分类", "金额（元）", "标签", "备注"],
      ...records
        .filter((r) => r.kind === "expense")
        .map((r) => [
          r.dueAt,
          r.title,
          r.meta.direction === "in" ? "收入" : "支出",
          r.meta.category,
          Number(r.meta.amount || 0).toFixed(2),
          r.tags.join(", "),
          r.content,
        ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function exportRecord(r: SpaceRecord) {
  const title = r.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100);
  if (r.kind === "contact") download(vcard(r), title + ".vcf", "text/vcard;charset=utf-8");
  else if (r.kind === "event") download(ical([r]), title + ".ics", "text/calendar;charset=utf-8");
  else if (r.kind === "expense") download(ledgerCSV([r]), title + ".csv", "text/csv;charset=utf-8");
  else
    download(
      `# ${r.title}\n\n${r.content}\n\n${r.tags.map((t) => "#" + t).join(" ")}\n`,
      title + ".md",
      "text/markdown;charset=utf-8",
    );
}
export { localDate };
