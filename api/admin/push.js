import webpush from "web-push";
import { del } from "@vercel/blob";
import { json, guard, listAll } from "../_lib.js";

// Send a notification to every phone that turned on offers.
export async function POST(req) {
  const g = guard(req); if (g) return g;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return json({ error: "push_not_configured" }, 503);
  let b = {};
  try { b = await req.json(); } catch {}
  const title = String(b.title || "").trim().slice(0, 80);
  const body = String(b.body || "").trim().slice(0, 240);
  let url = String(b.url || "/").trim();
  if (!url.startsWith("/") || url.startsWith("//")) url = "/";
  if (!title || !body) return json({ error: "missing_text" }, 400);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://oxinab.me", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const subs = await listAll("subs/");
  const payload = JSON.stringify({ title, body, url });
  let sent = 0, failed = 0;
  const gone = [];
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(subs.slice(i, i + 25).map(async (s) => {
      try {
        const sub = await (await fetch(s.url, { cache: "no-store" })).json();
        await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: "normal" });
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.url); else failed++;
      }
    }));
  }
  if (gone.length) await del(gone);
  return json({ ok: true, sent, failed, removed: gone.length, total: subs.length });
}
