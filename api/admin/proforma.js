import { put } from "@vercel/blob";
import { json, guard, listAll } from "../_lib.js";
import { seal, open } from "../_orders.js";

/* Proformas (quotes) sent to clients.
   Company details: proforma-cfg/<time>.json, the newest one wins.
   Each issued proforma: proforma/<year>-<number>-<time>.json, so numbers run PF-2026-0001, 0002… within a year.
   Both are encrypted like orders, because they hold client names, phone numbers and bank details. */
const ts = () => String(Date.now()).padStart(15, "0");
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v, lo, hi, d = 0) => { const n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 100) / 100)) : d; };

export const DEFAULT_CFG = {
  co: "Oxinab", sub: "Emergency, medical and home health supplies", addr: "Lebanon", tel: "+961 76 878 113", email: "", web: "www.oxinab.me",
  vatno: "", vat: 0, valid: 7, pay: "Cash on delivery",
  terms: "Prices are in US dollars.\nAvailability and delivery date are confirmed when you accept this proforma.\nDelivery all over Lebanon.",
  bank: "",
};
function cleanCfg(c = {}) {
  return {
    co: str(c.co, 80) || "Oxinab", sub: str(c.sub, 120), addr: str(c.addr, 200), tel: str(c.tel, 40), email: str(c.email, 80), web: str(c.web, 80),
    vatno: str(c.vatno, 40), vat: num(c.vat, 0, 50), valid: Math.round(num(c.valid, 1, 365, 7)), pay: str(c.pay, 120), terms: str(c.terms, 1200), bank: str(c.bank, 600),
  };
}
function cleanDoc(d = {}) {
  const lines = (Array.isArray(d.lines) ? d.lines : []).slice(0, 200).map((l) => ({
    id: str(l.id, 24), n: str(l.n, 160) || "Item", q: Math.round(num(l.q, 0, 99999, 1)), p: num(l.p, 0, 1e7),
  })).filter((l) => l.q > 0);
  if (!lines.length) throw new Error("no_lines");
  return {
    order: /^[A-Z0-9]{6}$/.test(d.order || "") ? d.order : "",
    client: { name: str(d.client?.name, 80), co: str(d.client?.co, 80), phone: str(d.client?.phone, 30), addr: str(d.client?.addr, 200) },
    lines, disc: num(d.disc, 0, 1e7), ship: num(d.ship, 0, 1e7), vat: num(d.vat, 0, 50), valid: Math.round(num(d.valid, 1, 365, 7)),
    note: str(d.note, 600),
  };
}
const newest = async (prefix) => (await listAll(prefix)).sort((a, b) => b.pathname.localeCompare(a.pathname));
async function read(b) { const r = await fetch(b.url, { cache: "no-store" }); if (!r.ok) throw new Error("fetch"); return open(await r.text()); }

export async function GET(req) {
  const g = guard(req); if (g) return g;
  const cf = await newest("proforma-cfg/");
  let cfg = DEFAULT_CFG;
  if (cf.length) { try { cfg = { ...DEFAULT_CFG, ...(await read(cf[0])) }; } catch {} }
  const files = (await newest("proforma/")).slice(0, 60);
  const docs = (await Promise.all(files.map((f) => read(f).catch(() => null)))).filter(Boolean);
  return json({ cfg, docs });
}
// Save the company details: { cfg }
export async function PUT(req) {
  const g = guard(req); if (g) return g;
  let b = {}; try { b = await req.json(); } catch {}
  const cfg = cleanCfg(b.cfg);
  await put(`proforma-cfg/${ts()}.json`, seal(cfg), { access: "public", addRandomSuffix: true, contentType: "application/json" });
  return json({ ok: true, cfg });
}
// Issue a proforma: { doc } → it gets the next number and is kept for re-downloading.
export async function POST(req) {
  const g = guard(req); if (g) return g;
  let b = {}; try { b = await req.json(); } catch {}
  let doc;
  try { doc = cleanDoc(b.doc); } catch (e) { return json({ error: "invalid", detail: e.message }, 400); }
  const year = new Date().getUTCFullYear();
  let last = 0;
  for (const f of await listAll(`proforma/${year}-`)) { const m = f.pathname.match(/^proforma\/\d{4}-(\d{4,})-/); if (m) last = Math.max(last, +m[1]); }
  const n = last + 1, no = `PF-${year}-${String(n).padStart(4, "0")}`;
  // Keep a copy of the company details as they were, so a re-download looks the same as the one sent.
  const cf = await newest("proforma-cfg/");
  let cfg = DEFAULT_CFG;
  if (cf.length) { try { cfg = { ...DEFAULT_CFG, ...(await read(cf[0])) }; } catch {} }
  const out = { ...doc, no, at: new Date().toISOString(), cfg };
  await put(`proforma/${year}-${String(n).padStart(4, "0")}-${ts()}.json`, seal(out), { access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 31536000 });
  return json({ ok: true, doc: out });
}
