import { requireChatGPTUser } from "./chatgpt-auth";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <Workspace user={{ name: user.fullName || "我的空间", email: user.email }} />;
}
