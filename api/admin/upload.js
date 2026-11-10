import { put } from "@vercel/blob";
import { json, guard } from "../_lib.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Product photo upload. The admin page shrinks photos before sending, so they stay small.
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!TYPES[type]) return json({ error: "type" }, 415);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return json({ error: "empty" }, 400);
  if (buf.length > 3_000_000) return json({ error: "too_large" }, 413);
  const b = await put("img/product." + TYPES[type], buf, { access: "public", addRandomSuffix: true, contentType: type, cacheControlMaxAge: 31536000 });
  return json({ url: b.url });
}
