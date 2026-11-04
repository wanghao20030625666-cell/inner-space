import { isCalendarDate, type Kind, type Preferences } from "./model";
export type ReminderSource = {
  id: string;
  kind: Kind;
  title: string;
  dueAt: string | null;
  meta: Record<string, string | number>;
};
export type Reminder = {
  id: string;
  kind: Kind;
  title: string;
  date: string;
  days: number;
  type: "birthday" | "countdown" | "subscription";
};
const day = (value: string) => Date.parse(value + "T00:00:00Z");
/** Calendar-day arithmetic avoids DST offsets; Feb 29 birthdays use Feb 28 in ordinary years. */
export function nextBirthday(monthDay: string, today: string) {
  if (
    !/^\d{2}-\d{2}$/.test(monthDay) ||
    !isCalendarDate(`2000-${monthDay}`) ||
    !isCalendarDate(today)
  )
    return null;
  const inYear = (year: number) => {
    const value = `${year}-${monthDay}`;
    return isCalendarDate(value) ? value : `${year}-02-28`;
  };
  const year = Number(today.slice(0, 4)),
    candidate = inYear(year);
  return candidate >= today ? candidate : inYear(year + 1);
}
export function buildReminders(rows: ReminderSource[], today: string): Reminder[] {
  if (!isCalendarDate(today)) return [];
  return rows
    .flatMap((r): Reminder[] => {
      if (r.kind !== "event" && r.kind !== "contact") return [];
      const type = r.kind === "contact" ? "birthday" : r.meta.reminderType;
      const date =
        type === "birthday" ? nextBirthday(String(r.meta.birthday || ""), today) : r.dueAt;
      if (
        !["birthday", "countdown", "subscription"].includes(String(type)) ||
        !date ||
        !isCalendarDate(date)
      )
        return [];
      const days = Math.round((day(date) - day(today)) / 86400000);
      return [
        { id: r.id, kind: r.kind, title: r.title, date, days, type: type as Reminder["type"] },
      ];
    })
    .sort(
      (a, b) =>
        a.days - b.days || a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id),
    )
    .slice(0, 8);
}
export const reminderLabel = { birthday: "生日", countdown: "倒数日", subscription: "续费" };
/** Expiry uses the exact elapsed-day boundary used by server cleanup, not a promised timer. */
export function trashExpiry(
  deletedAt: string | null,
  days: Preferences["trashRetentionDays"],
  now = new Date(),
) {
  if (!deletedAt || !days || !Number.isFinite(Date.parse(deletedAt))) return null;
  const date = new Date(Date.parse(deletedAt) + days * 86400000);
  const remaining = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  return {
    date: date.toISOString(),
    days: Math.max(0, remaining),
    due: date.getTime() <= now.getTime(),
  };
}
