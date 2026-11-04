import { z } from "zod";
/** Keep a deletion batch under D1's statement budget, including photo cleanup and retention. */
export const trashBatchInput = z
  .object({
    items: z
      .array(z.object({ id: z.string().uuid(), version: z.number().int().positive() }).strict())
      .min(1)
      .max(10)
      .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length),
  })
  .strict();
export type TrashRef = { id: string; version: number };
export type TrashResult = { id: string; status: "deleted" | "changed" | "unavailable" };
/** A snapshot fixes the IDs and versions the user reviewed; later additions are excluded. */
export type TrashSnapshot = { items: TrashRef[]; all: boolean };
