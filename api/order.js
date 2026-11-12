// A customer tapped "Send order on WhatsApp": keep a copy of the order for the command center.
import { json, blobReady, loadCatalogFast as loadCatalog, sameOrigin } from "./_lib.js";
import { list, put } from "@vercel/blob";
import { kvOn, kvGet } from "./_kv.js";
import { saveOrder, ORDER_ID, trackPath, TRACK_PATH, trackFromOrder, readTrack, writeTrack, phoneKey } from "./_orders.js";

const hits = new Map(); // best effort, per server instance: at most 20 orders an hour from one address
const str = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function POST(req) {
  console.log("order.in", req.headers.get("origin") || "-", req.headers.get("host") || "-");
  if (!sameOrigin(req)) { console.warn("order.bad_origin", req.headers.get("origin")); return json({ error: "bad_origin" }, 403); }
  if (!blobReady()) return json({ error: "storage_not_connected" }, 503);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => t > now - 3600e3);
  if (h.length >= 20) return json({ error: "too_many" }, 429);
  hits.set(ip, [...h, now]);

  let b = {};
  try { b = await req.json(); } catch {}
  if (b && typeof b.diag === "string") { console.warn("client.diag", b.diag.slice(0, 300), "|", str(b.ua, 160), "| app:", !!b.sa); return json({ ok: true }); }
  const id = String(b.id || "");
  if (!ORDER_ID.test(id)) { console.warn("order.bad_id"); return json({ error: "bad_id" }, 400); }
  const { data } = await loadCatalog();
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 100).map((x) => {
    const p = byId.get(String(x && x.id)), q = Math.floor(Number(x && x.q));
    return p && q > 0 && q <= 999 ? { id: p.id, n: p.n, q, p: p.p || 0 } : null;
  }).filter(Boolean);
  if (!items.length) { console.warn("order.no_items", id); return json({ error: "no_items" }, 400); }
  const priced = items.every((i) => i.p > 0);
  const order = {
    id, at: new Date().toISOString(),
    name: str(b.name, 80), phone: str(b.phone, 30), addr: str(b.addr, 200), note: str(b.note, 300),
    lang: b.lang === "ar" ? "ar" : "en",
    items, total: priced ? Math.round(items.reduce((s, i) => s + i.p * i.q, 0) * 100) / 100 : null,
  };
  // The phone may send the same order twice (beacon, then a confirming retry): keep it once.
  if ((await list({ prefix: `oid/${id}`, limit: 1 })).blobs.length) {
    console.log("order.duplicate", id);
    const t = await readTrack(id).catch(() => null);
    return json({ ok: true, id, dup: true, u: t ? t.url : "" });
  }
  await saveOrder(order);
  await put(`oid/${id}.json`, "{}", { access: "public", addRandomSuffix: true, contentType: "application/json" });
  let u = "";
  try { u = await writeTrack(trackFromOrder(order)); } catch (e) { console.error("track.create_failed", id, e && e.message); }
  console.log("order.saved", id, items.length, "items");
  return json({ ok: true, id, u });
}

/* The client's "My orders" screen.
   ?u=<tracking file address>  → the latest progress of that order (the phone remembers this address for its own orders).
   ?id=<order number>&phone=<number> → finds an order sent from another phone; both must match. */
const looks = new Map(), finds = new Map();
const pub = ({ ph, ...d }) => d;
// While the order is out for delivery, add where its driver is (if they shared it in the last 3 minutes).
async function withDriver(doc) {
  const d = pub(doc);
  if (d.driver) { const { id, ...rest } = d.driver; d.driver = rest; }
  if (doc.status === "out" && doc.driver && kvOn()) { try { const l = await kvGet("loc:" + doc.driver.id); if (l) d.loc = { lat: l.lat, lng: l.lng, acc: l.acc, hd: l.hd, t: l.t }; } catch {} }
  return d;
}
export async function GET(req) {
  if (!blobReady()) return json({ error: "storage_not_connected" }, 503);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now(), h = (looks.get(ip) || []).filter((t) => t > now - 3600e3);
  if (h.length >= 3000) return json({ error: "too_many" }, 429);
  looks.set(ip, [...h, now]);
  const q = new URL(req.url).searchParams;
  const u = q.get("u");
  if (u) {
    // The phone keeps the tracking address it got when the order was sent; only its last part is used.
    const m = String(u).match(/track\/([A-Z0-9]{6})-([0-9a-f]{16})\.json$/);
    if (!m || trackPath(m[1]) !== `track/${m[1]}-${m[2]}.json`) return json({ error: "bad_url" }, 400);
    const t = await readTrack(m[1]);
    if (!t) return json({ error: "not_found" }, 404);
    return json({ order: await withDriver(t.doc), u, poll: kvOn() ? 8 : 30 });
  }
  const id = String(q.get("id") || "").trim().toUpperCase().replace(/^#/, "");
  const ph = phoneKey(q.get("phone"));
  if (!ORDER_ID.test(id) || !ph) return json({ error: "bad_request" }, 400);
  // Guessing order numbers and phones: at most 15 lookups per 10 minutes from one address.
  const f = (finds.get(ip) || []).filter((t) => t > now - 600e3);
  if (f.length >= 15) return json({ error: "too_many" }, 429);
  finds.set(ip, [...f, now]);
  const t = await readTrack(id);
  if (!t || !t.doc.ph || t.doc.ph !== ph) return json({ error: "not_found" }, 404);
  return json({ order: await withDriver(t.doc), u: t.url, poll: kvOn() ? 8 : 30 });
}
