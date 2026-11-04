import { requireChatGPTUser } from "./chatgpt-auth";
import Workspace from "./workspace";
import { loadPreferences } from "./lib/preferences.server";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  const preferences = await loadPreferences(user.userId);
  return (
    <Workspace
      initialPreferences={preferences}
      user={{ name: user.fullName || "我的空间", email: user.email }}
    />
  );
}
