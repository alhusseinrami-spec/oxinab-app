import { put } from "@vercel/blob";
import { json, guard } from "../_lib.js";
import { updateTrack, ORDER_ID } from "../_orders.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Product photo upload. The admin page shrinks photos before sending, so they stay small.
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();
  // A proforma PDF for the client's tracking page: ?order=<number>&no=<proforma number>
  if (type === "application/pdf") {
    const q = new URL(req.url).searchParams, order = q.get("order") || "", no = q.get("no") || "";
    if (!ORDER_ID.test(order) || !/^PF-\d{4}-\d{4,}$/.test(no)) return json({ error: "bad_request" }, 400);
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length < 100 || buf.length > 8_000_000 || buf.subarray(0, 4).toString() !== "%PDF") return json({ error: "bad_pdf" }, 400);
    const b = await put(`pf/Oxinab-proforma-${no}.pdf`, buf, { access: "public", addRandomSuffix: true, contentType: "application/pdf", cacheControlMaxAge: 31536000 });
    const ok = await updateTrack(order, (d) => { d.pf = { no, url: b.url }; });
    if (!ok) return json({ error: "order_not_found" }, 404);
    return json({ url: b.url });
  }
  if (!TYPES[type]) return json({ error: "type" }, 415);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return json({ error: "empty" }, 400);
  if (buf.length > 3_000_000) return json({ error: "too_large" }, 413);
  const b = await put("img/product." + TYPES[type], buf, { access: "public", addRandomSuffix: true, contentType: type, cacheControlMaxAge: 31536000 });
  return json({ url: b.url });
}
