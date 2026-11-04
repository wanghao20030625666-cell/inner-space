import { authorize, cleanBlobs, failure, json } from "../../lib/server";
export async function POST(request: Request) { try { const owner = await authorize(request); return json({ pending: await cleanBlobs(owner) }); } catch (e) { return failure(e); } }
