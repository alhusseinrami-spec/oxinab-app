// Shared helpers for the Oxinab API. Files starting with "_" are not deployed as routes.
import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { put, list, del, head } from "@vercel/blob";
import SEED from "./_seed.js";

/* ---------- Home page slides (brands and offers) ----------
   Shown until an admin publishes their own. Each slide: im image, t/ta title EN/AR, s/sa line EN/AR, l/la small label EN/AR,
   go where a tap leads ("" nothing, "c3" a category, "q:word" a search), bg colour, on shown or hidden. */
export const DEFAULT_BANNERS = [
  { im: "/img/p31.jpg", l: "Brand", la: "علامة تجارية", t: "Burnshield burn care", ta: "Burnshield لعلاج الحروق", s: "Hydrogel gels, sprays and dressings that cool and cover burns fast.", sa: "جل وبخاخات وضمادات هيدروجيل تبرّد الحروق وتغطيها بسرعة.", go: "q:Burnshield", bg: "#c62828", on: 1 },
  { im: "/img/p82.jpg", l: "Brand", la: "علامة تجارية", t: "Biosynex home health", ta: "Biosynex للصحة المنزلية", s: "Blood pressure monitors, thermometers, oximeters and self-tests.", sa: "أجهزة ضغط، موازين حرارة، أجهزة أكسجة واختبارات ذاتية.", go: "q:Biosynex", bg: "#0d47a1", on: 1 },
  { im: "/img/p48.jpg", l: "New", la: "جديد", t: "BoonFeet custom insoles", ta: "نعال BoonFeet الطبية", s: "Five sizes, moulded to your foot for all-day comfort.", sa: "خمسة مقاسات، تتشكّل حسب قدمك لراحة طوال اليوم.", go: "q:BoonFeet", bg: "#00897b", on: 1 },
];
if (!Array.isArray(SEED.banners)) SEED.banners = DEFAULT_BANNERS;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export const blobReady = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/* ---------- Admin sign-in ----------
   The password lives only in the ADMIN_PASSWORD environment variable, set by the owner in Vercel.
   The session cookie is signed with a key derived from that password, so changing the password signs everyone out. */
const COOKIE = "oxa";
const SESSION_HOURS = 12;
const secret = () => createHash("sha256").update("oxinab-session:" + (process.env.ADMIN_PASSWORD || "")).digest();
const sign = (v) => createHmac("sha256", secret()).update(v).digest("base64url");

export function passwordConfigured() {
  return (process.env.ADMIN_PASSWORD || "").length >= 10;
}
export function checkPassword(given) {
  if (!passwordConfigured() || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(process.env.ADMIN_PASSWORD).digest();
  return timingSafeEqual(a, b);
}
export function sessionCookie() {
  const exp = String(Date.now() + SESSION_HOURS * 3600e3);
  const nonce = randomBytes(9).toString("base64url");
  const v = exp + "." + nonce;
  return `${COOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export function isAdmin(req) {
  if (!passwordConfigured()) return false;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)oxa=([^;]+)/);
  if (!m) return false;
  const [exp, nonce, sig] = m[1].split(".");
  if (!exp || !nonce || !sig) return false;
  const want = sign(exp + "." + nonce);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return false;
  return Number(exp) > Date.now();
}
/* Admin writes must come from this site (blocks cross-site form posts). */
export function sameOrigin(req) {
  const o = req.headers.get("origin");
  if (!o) return true;
  try { return new URL(o).host === new URL(req.url).host; } catch { return false; }
}
export function guard(req) {
  if (!isAdmin(req)) return json({ error: "signed_out" }, 401);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  if (!blobReady()) return json({ error: "storage_not_connected" }, 503);
  return null;
}

/* ---------- Catalogue storage ----------
   Each save is a new file catalog/<time>-<random>.json; the newest one is live. Old versions are kept as history (last 20). */
export async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
export async function loadCatalog() {
  if (!blobReady()) return { data: SEED, version: "seed" };
  const all = await listAll("catalog/");
  if (!all.length) return { data: SEED, version: "seed" };
  all.sort((a, b) => b.pathname.localeCompare(a.pathname));
  const r = await fetch(all[0].url, { cache: "no-store" });
  if (!r.ok) throw new Error("catalog_fetch_" + r.status);
  return fixup(await r.json(), all[0].pathname);
}
function fixup(data, version) {
  // A newer product list shipped in the code replaces the saved one once; the shop's settings are kept.
  if (!Array.isArray(data.banners)) data.banners = DEFAULT_BANNERS;
  if ((data.seedv || 1) < (SEED.seedv || 1)) return { data: { ...SEED, set: { ...SEED.set, ...data.set }, banners: data.banners }, version };
  return { data, version };
}
/* The shop and new orders read the live catalogue from one fixed file, catalog-live.json, through the storage's cache.
   Listing files is a counted operation on the free plan (2,000 a month), so it is kept for the command center only.
   A published change reaches phones within about a minute. */
const LIVE = "catalog-live.json";
let liveUrl = null;
const putLive = (data) => put(LIVE, JSON.stringify(data), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
export async function loadCatalogFast() {
  if (!blobReady()) return { data: SEED, version: "seed" };
  try {
    if (!liveUrl) liveUrl = (await head(LIVE)).url;
    const r = await fetch(liveUrl + "?v=" + Math.floor(Date.now() / 60000));
    if (r.ok) return fixup(await r.json(), "live");
  } catch {}
  const c = await loadCatalog();
  if (c.version !== "seed") { try { liveUrl = (await putLive(c.data)).url; } catch {} }
  return c;
}
export async function saveCatalog(data) {
  const name = "catalog/" + String(Date.now()).padStart(15, "0") + ".json";
  const b = await put(name, JSON.stringify(data), { access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 31536000 });
  try { liveUrl = (await putLive(data)).url; } catch (e) { console.error("catalog.live_write_failed", String(e)); }
  const all = await listAll("catalog/");
  all.sort((a, b) => b.pathname.localeCompare(a.pathname));
  const old = all.slice(20).map((x) => x.url);
  if (old.length) await del(old);
  return b.pathname;
}

/* ---------- Validation of a catalogue sent by the admin ---------- */
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const okImg = (s) => s === "" || /^\/img\/[\w.-]+$/.test(s) || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[\w./-]+$/i.test(s);
export function cleanCatalog(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.cats) || !Array.isArray(input.items)) throw new Error("shape");
  if (input.cats.length > 60 || input.items.length > 3000) throw new Error("too_many");
  const cats = input.cats.map((c) => ({
    n: str(c.n, 60) || "Category",
    a: str(c.a, 60),
    c: /^#[0-9a-f]{6}$/i.test(c.c) ? c.c : "#008dd5",
    e: str(c.e, 8) || "📦",
  }));
  const seen = new Set();
  const items = input.items.map((i) => {
    const id = str(i.id, 24).replace(/\s+/g, "-").replace(/[^A-Za-z0-9_./-]/g, "");
    if (!id || seen.has(id)) throw new Error("bad_ref:" + id);
    seen.add(id);
    const k = Number.isInteger(i.k) && i.k >= 0 && i.k < cats.length ? i.k : 0;
    const p = Number(i.p);
    const s = i.s === null || i.s === "" || i.s === undefined ? null : Math.max(0, Math.floor(Number(i.s)) || 0);
    const im = str(i.im, 300);
    if (!okImg(im)) throw new Error("bad_image:" + id);
    return {
      id, k,
      n: str(i.n, 140) || id, a: str(i.a, 140),
      d: str(i.d, 400), ad: str(i.ad, 400),
      p: isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : 0,
      s, off: i.off ? 1 : 0, im,
    };
  });
  const banners = (Array.isArray(input.banners) ? input.banners : DEFAULT_BANNERS).slice(0, 12).map((b, n) => {
    const im = str(b.im, 300);
    if (!okImg(im)) throw new Error("bad_slide_image:" + (n + 1));
    let go = str(b.go, 62);
    const m = /^c(\d{1,2})$/.exec(go);
    if (m ? +m[1] >= cats.length : !/^q:.+/.test(go)) go = "";
    return {
      im, go,
      t: str(b.t, 80), ta: str(b.ta, 80), s: str(b.s, 160), sa: str(b.sa, 160), l: str(b.l, 24), la: str(b.la, 24),
      bg: /^#[0-9a-f]{6}$/i.test(b.bg) ? b.bg : "#001765",
      on: b.on ? 1 : 0,
    };
  });
  const st = input.set || {};
  const wa = String(st.wa || "").replace(/\D/g, "").replace(/^00/, "");
  return {
    v: 1,
    seedv: Math.max(Number(input.seedv) || 1, SEED.seedv || 1),
    set: {
      price: st.price ? 1 : 0,
      low: Math.max(0, Math.min(999, Math.floor(Number(st.low)) || 0)),
      wa: wa.length >= 8 && wa.length <= 15 ? wa : "96176878113",
      upd: new Date().toISOString(),
    },
    cats, items, banners,
  };
}
