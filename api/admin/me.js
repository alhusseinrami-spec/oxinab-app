import { json, isAdmin, passwordConfigured, blobReady, listAll } from "../_lib.js";

export async function GET(req) {
  if (!isAdmin(req)) return json({ signedIn: false, setUp: passwordConfigured() });
  let subscribers = null;
  if (blobReady()) { try { subscribers = (await listAll("subs/")).length; } catch {} }
  return json({ signedIn: true, storage: blobReady(), push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), subscribers });
}
