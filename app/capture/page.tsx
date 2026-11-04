import { getChatGPTUser } from "../chatgpt-auth";
import CaptureGateway from "../components/capture-gateway";
export const dynamic = "force-dynamic";
/** The public handoff contains no account data and preserves capture fragments across sign-in. */
export default async function CapturePage() {
  const user = await getChatGPTUser();
  return <CaptureGateway signedIn={!!user} />;
}
