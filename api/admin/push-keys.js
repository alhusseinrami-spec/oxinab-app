import webpush from "web-push";
import { json, isAdmin, sameOrigin } from "../_lib.js";

// One-time setup: make a new key pair for push notifications, shown only to the signed-in admin,
// who pastes it into Vercel. Nothing is stored here. Refuses once keys are already set.
export async function POST(req) {
  if (!isAdmin(req)) return json({ error: "signed_out" }, 401);
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return json({ error: "already_set" }, 409);
  const k = webpush.generateVAPIDKeys();
  return json({ VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey });
}
