export type MonthTotal = { month: string; incomeCents: number; expenseCents: number };
/** Fill missing natural months with zero; the chosen anchor is explicit in the chart. */
export function monthlySeries(rows: MonthTotal[], anchor: string, count = 6): MonthTotal[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(anchor) || count < 1 || count > 12)
    throw new Error("Invalid chart range");
  const [year, month] = anchor.split("-").map(Number),
    values = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(year, month - count + i, 1)),
      key = date.toISOString().slice(0, 7),
      value = values.get(key);
    return {
      month: key,
      incomeCents: Number.isFinite(value?.incomeCents) ? Math.max(0, value!.incomeCents) : 0,
      expenseCents: Number.isFinite(value?.expenseCents) ? Math.max(0, value!.expenseCents) : 0,
    };
  });
}
