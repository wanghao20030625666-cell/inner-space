import { authorize, body, database, failure, json, ApiError } from "../../lib/server";
import { preferencesInput } from "../../lib/model";
import { normalizePreferences, samePreferences } from "../../lib/preferences";
export async function GET(request: Request) {
  try {
    const owner = await authorize(request);
    const current = await database()
      .prepare("SELECT value FROM settings WHERE owner = ?")
      .bind(owner)
      .first<{ value: string }>();
    return json({ preferences: normalizePreferences(current ? JSON.parse(current.value) : null) });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const owner = await authorize(request),
      data = await body(request),
      value = preferencesInput.safeParse(data);
    if (!value.success) throw new ApiError(400, "空间名称或设置格式无效");
    const db = database(),
      current = await db
        .prepare("SELECT value FROM settings WHERE owner = ?")
        .bind(owner)
        .first<{ value: string }>();
    // Older clients may omit the baseline; the current UI always supplies it.
    if (data.expectedPreferences !== undefined) {
      const expected = preferencesInput.safeParse(data.expectedPreferences);
      if (!expected.success) throw new ApiError(400, "设置基准格式无效");
      if (
        !samePreferences(
          expected.data,
          normalizePreferences(current ? JSON.parse(current.value) : null),
        )
      )
        throw new ApiError(409, "设置在别处已更新，请载入或合并最新设置后保存");
    }
    const result = current
      ? await db
          .prepare("UPDATE settings SET value = ? WHERE owner = ? AND value = ? RETURNING owner")
          .bind(JSON.stringify(value.data), owner, current.value)
          .all()
      : await db
          .prepare(
            "INSERT INTO settings(owner, value) VALUES (?, ?) ON CONFLICT(owner) DO NOTHING RETURNING owner",
          )
          .bind(owner, JSON.stringify(value.data))
          .all();
    if (!result.results.length)
      throw new ApiError(409, "设置在别处已更新，请载入或合并最新设置后保存");
    return json({ preferences: value.data });
  } catch (e) {
    return failure(e);
  }
}
