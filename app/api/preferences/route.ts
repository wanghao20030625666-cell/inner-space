import { authorize, body, database, failure, json, ApiError } from "../../lib/server";
import { preferencesInput } from "../../lib/model";
export async function PUT(request: Request) {
  try {
    const owner = await authorize(request),
      value = preferencesInput.safeParse(await body(request));
    if (!value.success) throw new ApiError(400, "空间名称或设置格式无效");
    await database()
      .prepare(
        "INSERT INTO settings (owner, value) VALUES (?, ?) ON CONFLICT(owner) DO UPDATE SET value = excluded.value",
      )
      .bind(owner, JSON.stringify(value.data))
      .run();
    return json({ preferences: value.data });
  } catch (e) {
    return failure(e);
  }
}
