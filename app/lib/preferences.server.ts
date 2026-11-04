import { cache } from "react";
import { database } from "./server";
import { defaultPreferences, preferencesInput, type Preferences } from "./model";
/** React's request cache deduplicates layout/page reads; no cross-user global cache is kept. */
export const loadPreferences = cache(async (owner: string): Promise<Preferences> => {
  try {
    const saved = await database()
      .prepare("SELECT value FROM settings WHERE owner = ?")
      .bind(owner)
      .first<{ value: string }>();
    if (!saved) return defaultPreferences;
    const result = preferencesInput.safeParse({
      ...defaultPreferences,
      ...JSON.parse(saved.value),
    });
    return result.success ? result.data : defaultPreferences;
  } catch (error) {
    console.error("Preference lookup failed", error instanceof Error ? error.stack : "unknown");
    return defaultPreferences;
  }
});
