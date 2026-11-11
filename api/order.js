// A customer tapped "Send order on WhatsApp": keep a copy of the order for the command center.
import { json, blobReady, loadCatalog, sameOrigin } from "./_lib.js";
import { list, put } from "@vercel/blob";
import { saveOrder, ORDER_ID } from "./_orders.js";

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
  if ((await list({ prefix: `oid/${id}`, limit: 1 })).blobs.length) { console.log("order.duplicate", id); return json({ ok: true, id, dup: true }); }
  await saveOrder(order);
  await put(`oid/${id}.json`, "{}", { access: "public", addRandomSuffix: true, contentType: "application/json" });
  console.log("order.saved", id, items.length, "items");
  return json({ ok: true, id });
}
