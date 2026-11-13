// Sending one notification to one phone. Returns "sent", "gone" (the phone turned notifications off) or "failed".
import webpush from "web-push";
let ready = false;
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export async function sendPush(sub, msg) {
  if (!pushConfigured()) return "failed";
  if (!ready) { webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://oxinab.me", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); ready = true; }
  try { await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 86400, urgency: "high" }); return "sent"; }
  catch (e) { return e && (e.statusCode === 404 || e.statusCode === 410) ? "gone" : "failed"; }
}
