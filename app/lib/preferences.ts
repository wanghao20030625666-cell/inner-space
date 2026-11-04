import { defaultPreferences, preferencesInput, type Preferences } from "./model";

/** Normalize legacy settings and compare known fields independently of JSON key order. */
export function normalizePreferences(value: unknown): Preferences {
  const result = preferencesInput.safeParse({
    ...defaultPreferences,
    ...(value && typeof value === "object" ? value : {}),
  });
  return result.success ? result.data : { ...defaultPreferences };
}
export function samePreferences(a: Preferences, b: Preferences) {
  return (Object.keys(defaultPreferences) as (keyof Preferences)[]).every(
    (key) => a[key] === b[key],
  );
}
export type PreferencesForm = { base: Preferences; form: Preferences; remote: Preferences };
export type PreferencesAction =
  | { type: "edit"; value: Partial<Preferences> }
  | { type: "receive"; value: Preferences }
  | { type: "saved"; value: Preferences }
  | { type: "reload" }
  | { type: "merge" };
/** A dirty form keeps its baseline until the user explicitly reloads or merges changes. */
export function preferencesReducer(
  state: PreferencesForm,
  action: PreferencesAction,
): PreferencesForm {
  if (action.type === "edit") return { ...state, form: { ...state.form, ...action.value } };
  if (action.type === "saved")
    return { base: action.value, form: action.value, remote: action.value };
  if (action.type === "receive") {
    if (samePreferences(state.form, state.base))
      return { base: action.value, form: action.value, remote: action.value };
    return { ...state, remote: action.value };
  }
  if (action.type === "reload")
    return { base: state.remote, form: state.remote, remote: state.remote };
  const edits = Object.fromEntries(
    (Object.keys(defaultPreferences) as (keyof Preferences)[])
      .filter((key) => state.form[key] !== state.base[key])
      .map((key) => [key, state.form[key]]),
  );
  return { ...state, base: state.remote, form: { ...state.remote, ...edits } };
}

/** Retention is opt-in and measured as elapsed days from the server's deletion timestamp. */
export function trashCutoff(days: Preferences["trashRetentionDays"], now = new Date()) {
  return days ? new Date(now.getTime() - days * 86400000).toISOString() : null;
}
