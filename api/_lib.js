// Shared helpers for the Oxinab API. Files starting with "_" are not deployed as routes.
import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { put, list, del } from "@vercel/blob";
import SEED from "./_seed.js";

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
  const data = await r.json();
  // A newer product list shipped in the code replaces the saved one once; the shop's settings are kept.
  if ((data.seedv || 1) < (SEED.seedv || 1)) return { data: { ...SEED, set: { ...SEED.set, ...data.set } }, version: all[0].pathname };
  return { data, version: all[0].pathname };
}
export async function saveCatalog(data) {
  const name = "catalog/" + String(Date.now()).padStart(15, "0") + ".json";
  const b = await put(name, JSON.stringify(data), { access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 31536000 });
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
    cats, items,
  };
}
