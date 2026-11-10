import { createHash } from "node:crypto";
import { put, list, del } from "@vercel/blob";
import { json, blobReady, sameOrigin } from "../_lib.js";

const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|web\.push\.apple\.com)$/;
function parse(b) {
  const s = b && b.subscription;
  if (!s || typeof s.endpoint !== "string" || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return null;
  let u; try { u = new URL(s.endpoint); } catch { return null; }
  if (u.protocol !== "https:" || !PUSH_HOSTS.test(u.hostname) || s.endpoint.length > 1000) return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
}
const key = (endpoint) => "subs/" + createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  if (!blobReady()) return json({ error: "storage_not_connected" }, 503);
  let b = {}; try { b = await req.json(); } catch {}
  const sub = parse(b);
  if (!sub) return json({ error: "bad_subscription" }, 400);
  const k = key(sub.endpoint);
  const have = await list({ prefix: k, limit: 1 });
  if (!have.blobs.length) await put(k + ".json", JSON.stringify(sub), { access: "public", addRandomSuffix: true, contentType: "application/json" });
  return json({ ok: true });
}

export async function DELETE(req) {
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  if (!blobReady()) return json({ ok: true });
  let b = {}; try { b = await req.json(); } catch {}
  const sub = parse(b);
  if (!sub) return json({ error: "bad_subscription" }, 400);
  const have = await list({ prefix: key(sub.endpoint) });
  if (have.blobs.length) await del(have.blobs.map((x) => x.url));
  return json({ ok: true });
}
