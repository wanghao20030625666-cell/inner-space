import { requireChatGPTUser } from "./chatgpt-auth";
import Workspace from "./workspace";
import { database } from "./lib/server";
import { defaultPreferences, type Preferences } from "./lib/model";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  // Render the correct theme before hydration, without a separate preference cookie.
  // A temporary preferences lookup failure must not remove the shell's API retry UI.
  let saved: { value: string } | null = null;
  try {
    saved = await database()
      .prepare("SELECT value FROM settings WHERE owner = ?")
      .bind(user.userId)
      .first<{ value: string }>();
  } catch (error) {
    console.error("Preference lookup failed", error instanceof Error ? error.stack : "unknown");
  }
  const preferences: Preferences = saved
    ? { ...defaultPreferences, ...JSON.parse(saved.value) }
    : defaultPreferences;
  return (
    <Workspace
      initialPreferences={preferences}
      user={{ name: user.fullName || "我的空间", email: user.email }}
    />
  );
}
