// Order log. Each order is one file orders/<time>-<number>.json, encrypted so only this server can read it
// (the storage is public-URL, and orders hold customers' names and phone numbers).
// A status change adds a tiny file ostat/<number>/<time>-<status>.json; the newest one wins.
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { put, head } from "@vercel/blob";
import { listAll } from "./_lib.js";
import { kvOn, kvGet, kvSet, kv } from "./_kv.js";
import { sendPush } from "./_push.js";

// "new" is shown to clients as "Received". "out" is "Out for delivery".
export const STATUSES = ["new", "confirmed", "preparing", "out", "delivered", "cancelled"];
export const STEPS = ["new", "confirmed", "preparing", "out", "delivered"];
export const ORDER_ID = /^[A-Z0-9]{6}$/;
const key = () => createHash("sha256").update("oxinab-orders:" + (process.env.ORDERS_KEY || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
const ts = () => String(Date.now()).padStart(15, "0");

export function seal(obj) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
}
export function open(text) {
  const o = JSON.parse(text), d = createDecipheriv("aes-256-gcm", key(), Buffer.from(o.iv, "base64"));
  d.setAuthTag(Buffer.from(o.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, "base64")), d.final()]).toString("utf8"));
}

export async function saveOrder(order) {
  await put(`orders/${ts()}-${order.id}.json`, seal(order), { access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 31536000 });
}
export async function setStatus(id, status) {
  await put(`ostat/${id}/${ts()}-${status}.json`, "{}", { access: "public", addRandomSuffix: true, contentType: "application/json" });
}

export async function loadOrders(limit = 300) {
  const files = (await listAll("orders/")).sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, limit);
  const stat = {};
  for (const b of (await listAll("ostat/")).sort((a, b) => a.pathname.localeCompare(b.pathname))) {
    const m = b.pathname.match(/^ostat\/([A-Z0-9]{6})\/\d+-(\w+)/);
    if (m && STATUSES.includes(m[2])) stat[m[1]] = m[2];
  }
  const eta = {};
  for (const b of (await listAll("oeta/")).sort((a, b) => a.pathname.localeCompare(b.pathname))) {
    const m = b.pathname.match(/^oeta\/([A-Z0-9]{6})\/\d+-(\d+)/);
    if (m) eta[m[1]] = +m[2] ? new Date(+m[2]).toISOString() : "";
  }
  const out = [];
  for (let i = 0; i < files.length; i += 20) {
    out.push(...await Promise.all(files.slice(i, i + 20).map(async (f) => {
      try {
        const r = await fetch(f.url);
        if (!r.ok) return null;
        const o = open(await r.text());
        return { ...o, status: stat[o.id] || "new", eta: eta[o.id] || "" };
      } catch { return null; }
    })));
  }
  const seen = new Set();
  return out.filter((o) => o && !seen.has(o.id) && seen.add(o.id));
}

/* ---------- Tracking page for the client ----------
   Each order has a small public file track/<number>-<code>.json that the client's phone reads to show progress.
   The code is derived from a server-only key, so a tracking file can't be guessed from the order number.
   It holds no name, phone or address: only the items, total, progress, delivery time and proforma link.
   ph is a keyed fingerprint of the phone number, so "find my order" can check the number without storing it. */
const tkey = () => createHash("sha256").update("oxinab-track:" + (process.env.ORDERS_KEY || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
export const trackPath = (id) => `track/${id}-${createHmac("sha256", tkey()).update(id).digest("hex").slice(0, 16)}.json`;
export const TRACK_PATH = /^\/track\/([A-Z0-9]{6})-[0-9a-f]{16}\.json$/;
export function phoneKey(p) {
  // Same number written different ways (03 123 456, +961 3 123 456, 00961…) gives the same result.
  const d = String(p || "").replace(/\D/g, "").replace(/^00/, "").replace(/^961/, "").replace(/^0+/, "").slice(-8);
  return d.length >= 6 ? createHmac("sha256", tkey()).update("ph:" + d).digest("hex").slice(0, 16) : "";
}
export const trackFromOrder = (o) => ({
  id: o.id, at: o.at, items: o.items.map((i) => ({ id: i.id, n: i.n, q: i.q, p: i.p })), total: o.total,
  status: "new", steps: { new: o.at }, eta: "", pf: null, ph: phoneKey(o.phone), up: new Date().toISOString(),
});
export async function readTrack(id) {
  if (kvOn()) { const d = await kvGet("trk:" + id); if (d) return { url: trackPath(id), doc: d }; }
  let h; try { h = await head(trackPath(id)); } catch { return null; }
  const r = await fetch(h.url + "?v=" + Date.now(), { cache: "no-store" });
  if (!r.ok) return null;
  try { return { url: h.url, doc: await r.json() }; } catch { return null; }
}
// Returns the address the client's phone keeps for this order (only its file name part is used to find it again).
export async function writeTrack(doc) {
  doc.up = new Date().toISOString();
  if (kvOn()) { await kvSet("trk:" + doc.id, doc, 120 * 864e2); return trackPath(doc.id); }
  const b = await put(trackPath(doc.id), JSON.stringify(doc), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
  return b.url;
}
export async function findOrder(id) {
  const f = (await listAll("orders/")).filter((b) => new RegExp(`^orders/\\d+-${id}`).test(b.pathname));
  for (const b of f) { try { const r = await fetch(b.url); if (r.ok) return open(await r.text()); } catch {} }
  return null;
}
// Change the tracking file: fn(doc) edits it. Orders from before tracking existed get a file made on first change.
export async function updateTrack(id, fn) {
  let t = await readTrack(id), doc = t && t.doc;
  if (!doc) { const o = await findOrder(id); if (!o) return null; doc = trackFromOrder(o); }
  fn(doc);
  return writeTrack(doc);
}
export async function setEta(id, eta) {
  await put(`oeta/${id}/${ts()}-${eta ? Date.parse(eta) : 0}.json`, "{}", { access: "public", addRandomSuffix: true, contentType: "application/json" });
}

/* ---------- Small shared records: the drivers, and which driver delivers which order ----------
   Kept in Redis when it is connected, otherwise in one encrypted file each. */
export async function getState(k) {
  if (kvOn()) return kvGet("st:" + k);
  try { const h = await head(`state/${k}.json`); const r = await fetch(h.url + "?v=" + Date.now(), { cache: "no-store" }); return r.ok ? open(await r.text()) : null; } catch { return null; }
}
export async function setState(k, v) {
  if (kvOn()) return kvSet("st:" + k, v);
  await put(`state/${k}.json`, seal(v), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
}
// Set an order's status everywhere: the command center's log, the client's tracking page and the driver's list.
export async function applyStatus(id, status) {
  await setStatus(id, status);
  let changed = false, doc = null;
  const tracked = await updateTrack(id, (d) => {
    doc = d;
    if (d.status === status) return;
    changed = true;
    const now = new Date().toISOString();
    d.status = status;
    if (status !== "cancelled") {
      // Moving back a step clears the later steps; moving forward fills any skipped step with the same time.
      const k = STEPS.indexOf(status);
      STEPS.forEach((s, i) => { if (i > k) delete d.steps[s]; else if (!d.steps[s]) d.steps[s] = now; });
      delete d.steps.cancelled;
    } else d.steps.cancelled = now;
  }).catch((e) => { console.error("track.update_failed", id, e && e.message); return null; });
  const as = await getState("assign");
  if (as && as[id] && as[id].st !== status) { as[id].st = status; as[id].stAt = Date.now(); await setState("assign", as); }
  if (changed && ["confirmed", "out", "delivered"].includes(status)) await notifyOrder(id, status, doc);
  return !!tracked;
}

/* ---------- Order notifications on the client's phone ----------
   When a client turns on notifications in the app, their phone's push address is kept for each of their orders
   (osub:<order>, in Redis, for 60 days). They hear when the order is confirmed (with the delivery time if set),
   when a delivery time is set or changed, when it is on the way, and a thank-you when it is delivered. */
export async function linkOrderPush(id, sub, lang) {
  if (!kvOn()) return false;
  await kvSet("osub:" + id, { sub, lang: lang === "ar" ? "ar" : "en" }, 60 * 86400);
  return true;
}
const when = (iso, lang) => new Date(iso).toLocaleString(lang === "ar" ? "ar-LB" : "en-GB", { timeZone: "Asia/Beirut", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
function message(kind, id, d, lang) {
  const eta = d && d.eta ? when(d.eta, lang) : "", drv = d && d.driver ? d.driver.n : "";
  const ar = lang === "ar";
  switch (kind) {
    case "confirmed": return ar
      ? { title: `تم تأكيد طلبك رقم ${id} ✓`, body: eta ? `موعد التوصيل المتوقع: ${eta}.` : "نقوم بتجهيز طلبك وسنخبرك بموعد التوصيل." }
      : { title: `Order #${id} confirmed ✓`, body: eta ? `Expected delivery: ${eta}.` : "We're getting it ready and will let you know the delivery time." };
    case "eta": return ar
      ? { title: `موعد توصيل طلبك رقم ${id}`, body: `موعد التوصيل المتوقع: ${eta}.` }
      : { title: `Delivery time for order #${id}`, body: `Expected delivery: ${eta}.` };
    case "out": return ar
      ? { title: `طلبك رقم ${id} في الطريق 🛵`, body: (drv ? `السائق ${drv} في الطريق إليك. ` : "") + "تابع التوصيل مباشرة في «طلباتي»." }
      : { title: `Order #${id} is on the way 🛵`, body: (drv ? `${drv} is on the way to you. ` : "") + "Follow the delivery live in My orders." };
    case "delivered": return ar
      ? { title: "شكراً لاختيارك أوكسيناب 💙", body: `تم توصيل طلبك رقم ${id}. نتمنى أن ينال رضاك. لأي سؤال، راسلنا على واتساب.` }
      : { title: "Thank you for choosing Oxinab 💙", body: `Order #${id} has been delivered. We hope it serves you well. Any questions, we're on WhatsApp.` };
  }
  return null;
}
export async function notifyOrder(id, kind, doc) {
  if (!kvOn()) return;
  try {
    const rec = await kvGet("osub:" + id); if (!rec) return;
    const d = doc || (await readTrack(id) || {}).doc;
    const m = message(kind, id, d, rec.lang); if (!m) return;
    const r = await sendPush(rec.sub, { ...m, url: "/#orders", tag: "order-" + id });
    if (r === "gone") await kv("DEL", "osub:" + id);
    console.log("order.notify", id, kind, r);
  } catch (e) { console.error("order.notify_failed", id, kind, e && e.message); }
}
