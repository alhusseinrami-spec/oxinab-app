/* Sales app (/sales) for Oxinab's sales reps, and the Sales team tab of the command center.
   Reached at /api/sales (vercel.json sends it to /api/admin/proforma?do=sales: the free plan allows 12 routes).

   Reps: name, phone, PIN (salted hash only), monthly target in $, the most extra discount they may give without approval.
   Each rep's work is one record, "sr:<rep id>", so two reps saving at the same time never overwrite each other:
     cl  clients and leads   { id, st:"client"|"lead", stg (lead stage), n, co, k (type), tel, em, addr, area, lat, lng, dc, note, nx (follow-up date), nxn, at, up }
     of  offers              { id, cl, lines:[{ id, n, q, p, b (standard price), lp (list price), fq (catalogue offer), fr (free items the rep adds) }], disc, ship, vat, valid, note, st, ap, apk, pf, ord, at, up }
     vs  visits (check-ins)  { id, cl, in, out, lat, lng, acc, d (metres from the client's saved place), res, note }
     od  orders placed       { id, cl, of, total, at }
   Orders a rep places go into the normal order log, so they show in the command center and can be given to a driver. */
import { randomBytes } from "node:crypto";
import { list, put } from "@vercel/blob";
import { json, guard, isAdmin, repFromReq, sameOrigin, blobReady, loadCatalogFast, loadCatalog, saveCatalog, netPrice, freeQty } from "./_lib.js";
import { getState, setState, saveOrder, writeTrack, trackFromOrder } from "./_orders.js";
import { hashPin, checkPin, normPhone, pinVer } from "./_drivers.js";
import { cleanDoc, issueProforma, loadCfg } from "./_proforma.js";

export { checkPin };
export const loadReps = async () => (await getState("reps")) || [];
const saveReps = (l) => setState("reps", l);
/* What each account may use, switched on or off in the command center (Sales team tab).
   The owner's own account can have everything on and no discount limit; a new rep can get fewer. */
export const FEATURES = {
  leads: "Leads", map: "Map", checkin: "Check-in and check-out", offers: "Offers", prices: "Change prices in offers",
  proforma: "Create proformas", orders: "Place orders", target: "Monthly target", limit: "Discount limit (bigger discounts need approval)",
  remove: "Delete clients and offers", gps: "Check-in needs the phone's location",
};
const DEFAULT_F = { leads: 1, map: 1, checkin: 1, offers: 1, prices: 1, proforma: 1, orders: 1, target: 1, limit: 1, remove: 1, gps: 0 };
const cleanF = (f) => Object.fromEntries(Object.keys(FEATURES).map((k) => [k, f && f[k] !== undefined ? (f[k] ? 1 : 0) : DEFAULT_F[k]]));
const publicRep = ({ id, n, tel, on, tgt, mx, f }) => ({ id, n, tel, on: !!on, tgt: tgt || 0, mx: mx || 0, f: cleanF(f) });
const can = (r, k) => !!cleanF(r.f)[k];
const emptyDoc = () => ({ cl: [], of: [], vs: [], od: [] });
const loadDoc = async (id) => ({ ...emptyDoc(), ...((await getState("sr:" + id)) || {}) });
function saveDoc(id, d) {
  // Keep each record a sensible size: the newest visits, offers and orders.
  d.vs = d.vs.slice(-3000); d.of = d.of.slice(-600); d.od = d.od.slice(-1500); d.cl = d.cl.slice(-2500);
  return setState("sr:" + id, d);
}

const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const num = (v, lo, hi, d = 0) => { const n = Number(typeof v === "string" ? v.trim().replace(",", ".") : v); return isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 100) / 100)) : d; };
const nid = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
const coord = (v, lim) => { const n = Number(v); return v !== null && v !== "" && isFinite(n) && Math.abs(n) <= lim ? Math.round(n * 1e5) / 1e5 : null; };
const metres = (a, b) => {
  const R = 6371e3, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};
export const KINDS = ["pharmacy", "hospital", "clinic", "doctor", "lab", "ngo", "company", "other"];
export const STAGES = ["new", "contacted", "interested", "offer", "won", "lost"];
const OFFER_ST = ["open", "sent", "won", "lost"];
const RESULTS = ["order", "offer", "followup", "nointerest", "other"];

async function repGuard(req) {
  const me = repFromReq(req);
  if (!me) return { err: json({ error: "signed_out" }, 401) };
  if (req.method !== "GET" && !sameOrigin(req)) return { err: json({ error: "bad_origin" }, 403) };
  if (!blobReady()) return { err: json({ error: "storage_not_connected" }, 503) };
  const r = (await loadReps()).find((x) => x.id === me.id);
  if (!r || !r.on || pinVer(r) !== me.pv) return { err: json({ error: "signed_out" }, 401) };
  return { r };
}
// The command center adds ?as=admin; a phone signed in to both uses its rep account in the sales app.
const asAdmin = (req) => new URL(req.url).searchParams.get("as") === "admin";

export async function salesGET(req) {
  if (asAdmin(req)) {
    const g = guard(req); if (g) return g;
    const reps = await loadReps();
    const docs = {};
    await Promise.all(reps.map(async (r) => { docs[r.id] = await loadDoc(r.id); }));
    return json({ reps: reps.map(publicRep), docs, features: FEATURES });
  }
  const { r, err } = await repGuard(req); if (err) return err;
  return json({ me: publicRep(r), doc: await loadDoc(r.id), kinds: KINDS, stages: STAGES });
}

function cleanClient(c, old) {
  const st = c.st === "lead" ? "lead" : "client";
  const lat = coord(c.lat, 90), lng = coord(c.lng, 180), hasLoc = lat !== null && lng !== null;
  const out = {
    id: old ? old.id : nid(), st,
    stg: st === "lead" ? (STAGES.includes(c.stg) ? c.stg : "new") : "won",
    n: str(c.n, 80), co: str(c.co, 80), k: KINDS.includes(c.k) ? c.k : "other",
    tel: str(c.tel, 30), em: str(c.em, 80), addr: str(c.addr, 200), area: str(c.area, 60),
    lat: hasLoc ? lat : null, lng: hasLoc ? lng : null,
    dc: num(c.dc, 0, 90), note: str(c.note, 600), nx: day(c.nx), nxn: str(c.nxn, 200),
    src: str(c.src, 60), at: old ? old.at : new Date().toISOString(), up: new Date().toISOString(),
  };
  if (!out.n) throw new Error("name_needed");
  return out;
}

// Price an offer from the live catalogue. b is the standard client price (catalogue price less its discount and the client's own).
async function priceOffer(o, client, old, free = true) {
  const { data } = await loadCatalogFast();
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const cdc = client ? client.dc || 0 : 0;
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 150).map((l) => {
    const q = Math.floor(num(l.q, 0, 99999, 1)); if (!(q > 0)) return null;
    const it = byId.get(str(l.id, 24));
    if (it) {
      const b = Math.round(netPrice(it) * (1 - cdc / 100) * 100) / 100;
      const ld = Number(l.ld), lp0 = it.p || 0;
      const p = !free ? b
        : l.ld !== undefined && l.ld !== "" && l.ld !== null && isFinite(ld) && lp0 > 0 ? Math.round(lp0 * (1 - Math.min(100, Math.max(0, ld)) / 100) * 100) / 100
        : l.p === "" || l.p === null || l.p === undefined ? b : num(l.p, 0, 1e7);
      const fq = it.ob && !it.xo ? freeQty(it, q) : 0, fr = free ? Math.floor(num(l.fr, 0, 99999)) : 0;
      return { id: it.id, n: str(l.n, 160) || it.n, q, p, b, lp: it.p || 0, ...(fq ? { fq } : {}), ...(fr ? { fr } : {}) };
    }
    if (!free) return null; // custom lines are priced by hand
    const p = num(l.p, 0, 1e7), fr = Math.floor(num(l.fr, 0, 99999));
    return { id: str(l.id, 24), n: str(l.n, 160) || "Item", q, p, b: p, lp: p, ...(fr ? { fr } : {}) };
  }).filter(Boolean);
  if (!lines.length) throw new Error("no_lines");
  const sub = lines.reduce((s, l) => s + l.q * l.p, 0), base = lines.reduce((s, l) => s + (l.q + (l.fr || 0)) * l.b, 0);
  const disc = free ? Math.min(num(o.disc, 0, 1e7), sub) : 0;
  const extra = base > 0 ? Math.max(0, Math.round((1 - (sub - disc) / base) * 1000) / 10) : 0; // % below the standard price
  return {
    id: old ? old.id : nid(), cl: client ? client.id : "",
    lines, disc, ship: num(o.ship, 0, 1e7), vat: num(o.vat, 0, 50), valid: Math.round(num(o.valid, 1, 365, 7)), note: str(o.note, 600),
    st: OFFER_ST.includes(o.st) ? o.st : old ? old.st : "open", extra,
    pf: old ? old.pf || "" : "", ord: old ? old.ord || "" : "",
    at: old ? old.at : new Date().toISOString(), up: new Date().toISOString(),
  };
}
// The approval follows the exact prices: a change to an approved offer needs a new approval if it is still over the limit.
const priceKey = (o) => JSON.stringify([o.lines.map((l) => [l.id, l.q, l.p, l.fr || 0]), o.disc]);
const freeOf = (l) => (l.fq || 0) + (l.fr || 0);
const total = (o) => { const sub = o.lines.reduce((s, l) => s + l.q * l.p, 0), b = sub - Math.min(o.disc || 0, sub) + (o.ship || 0); return Math.round((b + b * (o.vat || 0) / 100) * 100) / 100; };
const blocked = (o) => o.ap === "wait" || o.ap === "no";

async function newOrderId() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let t = 0; t < 6; t++) {
    const id = [...randomBytes(6)].map((x) => A[x % A.length]).join("");
    if (!(await list({ prefix: `oid/${id}`, limit: 1 })).blobs.length) return id;
  }
  throw new Error("no_id");
}

export async function salesPOST(req) {
  let b = {}; try { b = await req.json(); } catch {}
  if (asAdmin(req)) return adminPOST(req, b);
  const { r, err } = await repGuard(req); if (err) return err;
  const D = await loadDoc(r.id), now = new Date().toISOString();
  const client = (id) => D.cl.find((c) => c.id === id);
  const need = { delclient: "remove", deloffer: "remove", checkin: "checkin", checkout: "checkin", offer: "offers", offerstatus: "offers", proforma: "proforma", order: "orders" }[b.do];
  if (need && !can(r, need)) return json({ error: "not_allowed", feature: need }, 403);

  switch (b.do) {
    // Add or change a client or lead: { do: "client", client }
    case "client": {
      const old = b.client && b.client.id ? client(b.client.id) : null;
      if (b.client && b.client.id && !old) return json({ error: "not_found" }, 404);
      let c; try { c = cleanClient(b.client || {}, old); } catch (e) { return json({ error: e.message }, 400); }
      if (c.st === "lead" && !can(r, "leads") && !(old && old.st === "lead")) return json({ error: "not_allowed", feature: "leads" }, 403);
      if (old) Object.assign(old, c); else D.cl.push(c);
      await saveDoc(r.id, D);
      return json({ ok: true, client: c, doc: D });
    }
    case "delclient": {
      const c = client(b.id); if (!c) return json({ error: "not_found" }, 404);
      if (D.od.some((o) => o.cl === c.id)) return json({ error: "has_orders" }, 409);
      D.cl = D.cl.filter((x) => x.id !== c.id);
      await saveDoc(r.id, D);
      return json({ ok: true, doc: D });
    }
    // Arrive at a client: { do: "checkin", cl, lat, lng, acc }
    case "checkin": {
      const c = client(b.cl); if (!c) return json({ error: "not_found" }, 404);
      if (D.vs.some((v) => !v.out)) return json({ error: "open_visit" }, 409);
      const lat = coord(b.lat, 90), lng = coord(b.lng, 180), has = lat !== null && lng !== null;
      if (!has && can(r, "gps")) return json({ error: "location_needed" }, 400);
      const v = { id: nid(), cl: c.id, in: now, out: "", lat: has ? lat : null, lng: has ? lng : null, acc: has ? Math.round(num(b.acc, 0, 1e5)) : null, d: null, res: "", note: "" };
      if (has && c.lat !== null && c.lng !== null) v.d = metres(c, v);
      // The first visit to a client without a saved place saves where the rep is standing.
      let saved = false;
      if (has && (c.lat === null || c.lng === null) && (v.acc === null || v.acc <= 150)) { c.lat = lat; c.lng = lng; c.up = now; saved = true; }
      D.vs.push(v);
      if (c.st === "lead" && c.stg === "new") c.stg = "contacted";
      await saveDoc(r.id, D);
      return json({ ok: true, visit: v, saved, doc: D });
    }
    // Leave: { do: "checkout", id, res, note, nx, nxn }
    case "checkout": {
      const v = D.vs.find((x) => x.id === b.id); if (!v) return json({ error: "not_found" }, 404);
      v.out = v.out || now; v.res = RESULTS.includes(b.res) ? b.res : "other"; v.note = str(b.note, 600);
      const c = client(v.cl);
      if (c && b.nx !== undefined) { c.nx = day(b.nx); c.nxn = str(b.nxn, 200); c.up = now; }
      if (c && c.st === "lead" && b.stg && STAGES.includes(b.stg)) c.stg = b.stg;
      await saveDoc(r.id, D);
      return json({ ok: true, doc: D });
    }
    // Add or change an offer: { do: "offer", offer }
    case "offer": {
      const o = b.offer || {}, old = o.id ? D.of.find((x) => x.id === o.id) : null;
      if (o.id && !old) return json({ error: "not_found" }, 404);
      const c = client(o.cl); if (!c) return json({ error: "client_needed" }, 400);
      if (old && old.ord) return json({ error: "already_ordered" }, 409);
      let p; try { p = await priceOffer(o, c, old, can(r, "prices")); } catch (e) { return json({ error: e.message }, 400); }
      const k = priceKey(p);
      // A proforma made before a price change no longer matches: the next one gets a new number.
      p.pfd = old && old.pfd && priceKey(old) === k ? old.pfd : null;
      if (!p.pfd) p.pf = "";
      if (can(r, "limit") && p.extra > (r.mx || 0) + 0.05) {
        p.ap = old && old.ap === "ok" && old.apk === k ? "ok" : "wait"; p.apk = k;
        if (p.ap === "wait") p.apAt = now;
      } else { p.ap = ""; p.apk = ""; }
      if (old) Object.assign(old, p); else D.of.push(p);
      if (c.st === "lead" && ["new", "contacted", "interested"].includes(c.stg)) c.stg = "offer";
      await saveDoc(r.id, D);
      return json({ ok: true, offer: p, doc: D });
    }
    case "offerstatus": {
      const o = D.of.find((x) => x.id === b.id); if (!o) return json({ error: "not_found" }, 404);
      if (!OFFER_ST.includes(b.st)) return json({ error: "bad_request" }, 400);
      o.st = b.st; o.up = now;
      const c = client(o.cl);
      if (c && c.st === "lead" && b.st === "won") { c.st = "client"; c.stg = "won"; }
      if (c && c.st === "lead" && b.st === "lost") c.stg = "lost";
      await saveDoc(r.id, D);
      return json({ ok: true, doc: D });
    }
    case "deloffer": {
      const o = D.of.find((x) => x.id === b.id); if (!o) return json({ error: "not_found" }, 404);
      if (o.ord || o.pf) return json({ error: "in_use" }, 409);
      D.of = D.of.filter((x) => x.id !== o.id);
      await saveDoc(r.id, D);
      return json({ ok: true, doc: D });
    }
    // A numbered proforma from an offer: { do: "proforma", id }
    case "proforma": {
      const o = D.of.find((x) => x.id === b.id); if (!o) return json({ error: "not_found" }, 404);
      if (blocked(o)) return json({ error: "needs_approval" }, 409);
      const c = client(o.cl) || {};
      const cfg = await loadCfg();
      const doc = cleanDoc({
        order: o.ord || "",
        client: { name: c.n || "", co: c.co || "", phone: c.tel || "", addr: [c.addr, c.area].filter(Boolean).join(", ") },
        lines: o.lines.flatMap((l) => {
          const lp = l.lp > 0 ? l.lp : 0, dc = lp && l.p < lp ? Math.round((1 - l.p / lp) * 1000) / 10 : 0;
          return [{ id: l.id, n: l.n, q: l.q, p: l.p, ...(lp ? { lp, dc } : {}) }, ...(freeOf(l) ? [{ id: l.id, n: `${l.n} (free goods)`, q: freeOf(l), p: 0, free: 1, ...(lp ? { lp, dc: 100 } : {}) }] : [])];
        }),
        disc: o.disc, ship: o.ship, vat: o.vat || cfg.vat || 0, valid: o.valid || cfg.valid || 7, note: o.note,
      });
      const pf = await issueProforma(doc, { rep: { id: r.id, n: r.n, tel: r.tel } });
      o.pf = pf.no; o.pfd = pf; o.up = now; if (o.st === "open") o.st = "sent";
      await saveDoc(r.id, D);
      return json({ ok: true, proforma: pf, doc: D });
    }
    // Place an order for the client from an offer: { do: "order", id, note }
    case "order": {
      const o = D.of.find((x) => x.id === b.id); if (!o) return json({ error: "not_found" }, 404);
      if (blocked(o)) return json({ error: "needs_approval" }, 409);
      if (o.ord) return json({ error: "already_ordered", id: o.ord }, 409);
      const c = client(o.cl); if (!c) return json({ error: "client_needed" }, 400);
      const id = await newOrderId();
      const items = o.lines.map((l) => ({ id: l.id || "-", n: l.n, q: l.q, p: l.p, ...(l.lp && l.lp > l.p ? { rp: l.lp, dc: Math.round((1 - l.p / l.lp) * 1000) / 10 } : {}), ...(freeOf(l) ? { fq: freeOf(l) } : {}) }));
      const extras = [o.disc ? `discount $${o.disc}` : "", o.ship ? `delivery $${o.ship}` : "", o.vat ? `VAT ${o.vat}%` : ""].filter(Boolean).join(", ");
      const order = {
        id, at: now,
        name: [c.n, c.co].filter(Boolean).join(" · "), phone: c.tel, addr: [c.addr, c.area].filter(Boolean).join(", "),
        note: [`Sales rep: ${r.n}`, o.pf ? `proforma ${o.pf}` : "", extras, str(b.note, 200)].filter(Boolean).join(" · ").slice(0, 300),
        lang: "en", items, total: total(o), rep: { id: r.id, n: r.n },
      };
      await saveOrder(order);
      await put(`oid/${id}.json`, "{}", { access: "public", addRandomSuffix: true, contentType: "application/json" });
      try { await writeTrack(trackFromOrder(order)); } catch (e) { console.error("track.create_failed", id, e && e.message); }
      // Sold and free units both leave the stock.
      try { await stockOut(id, o.lines.map((l) => [l.id, l.q + freeOf(l)])); } catch (e) { console.error("sales.stock_failed", id, e && e.message); }
      o.ord = id; o.st = "won"; o.up = now;
      D.od.push({ id, cl: c.id, of: o.id, total: order.total, at: now });
      if (c.st === "lead") { c.st = "client"; c.stg = "won"; }
      await saveDoc(r.id, D);
      console.log("sales.order", r.id, id, items.length);
      return json({ ok: true, id, doc: D });
    }
  }
  return json({ error: "bad_request" }, 400);
}

/* ---------- Stock ----------
   An order placed from the sales app takes its sold and free units out of the catalogue's stock (products with stock tracked).
   What was taken is remembered per order ("stk"), so cancelling the order in the command center puts it back,
   and un-cancelling takes it out again. */
// Take units out (sign 1) or put them back (sign -1). Returns what really moved, so a cancel puts back exactly that.
async function moveStock(pairs, sign) {
  const c = await loadCatalog();
  if (c.version === "seed") return []; // never publish the built-in list over a real one
  const byId = new Map(c.data.items.map((i) => [i.id, i])), moved = [];
  for (const [id, q] of pairs) {
    const it = byId.get(id); if (!it || it.s === null || it.s === undefined || !(q > 0)) continue;
    const n = sign > 0 ? Math.min(it.s, q) : q;
    if (n > 0) { it.s += sign > 0 ? -n : n; moved.push([id, n]); }
  }
  if (moved.length) await saveCatalog(c.data);
  return moved;
}
async function stockOut(orderId, pairs) {
  pairs = pairs.filter(([id, q]) => id && q > 0);
  const st = (await getState("stk")) || {};
  st[orderId] = { items: pairs, took: await moveStock(pairs, 1), out: true, at: Date.now() };
  for (const [k, v] of Object.entries(st)) if (Date.now() - (v.at || 0) > 180 * 864e5) delete st[k];
  await setState("stk", st);
}
// Called by the command center when an order's status changes: a cancel puts the units back, un-cancelling takes them out again.
export async function stockOnStatus(orderId, status) {
  const st = await getState("stk"), rec = st && st[orderId];
  if (!rec) return;
  const cancel = status === "cancelled";
  if (cancel && rec.out) { await moveStock(rec.took || [], -1); rec.took = []; rec.out = false; }
  else if (!cancel && !rec.out) { rec.took = await moveStock(rec.items, 1); rec.out = true; }
  else return;
  await setState("stk", st);
}

// The command center: { do: "reps", reps } | { do: "approve", rep, id, ok } | { do: "move", rep, id, to }
async function adminPOST(req, b) {
  const g = guard(req); if (g) return g;
  if (b.do === "reps" && Array.isArray(b.reps)) {
    const old = await loadReps(), out = [];
    for (const x of b.reps.slice(0, 50)) {
      const n = String(x.n || "").trim().slice(0, 40), tel = String(x.tel || "").trim().slice(0, 30);
      if (!n || normPhone(tel).length < 6) return json({ error: "bad_rep", detail: n || tel }, 400);
      const prev = old.find((o) => o.id === x.id), pin = x.pin ? String(x.pin) : "";
      if (pin && !/^\d{4,8}$/.test(pin)) return json({ error: "bad_pin", detail: n }, 400);
      if (!prev && !pin) return json({ error: "pin_needed", detail: n }, 400);
      if (out.some((o) => normPhone(o.tel) === normPhone(tel))) return json({ error: "same_phone", detail: n }, 400);
      out.push({ id: prev ? prev.id : randomBytes(5).toString("hex"), n, tel, on: x.on ? 1 : 0, tgt: Math.round(num(x.tgt, 0, 1e8)), mx: num(x.mx, 0, 90), f: cleanF(x.f), ...(pin ? hashPin(pin) : { salt: prev.salt, hash: prev.hash }) });
    }
    await saveReps(out);
    return json({ ok: true, reps: out.map(publicRep) });
  }
  const reps = await loadReps(), rep = reps.find((x) => x.id === b.rep);
  if (!rep) return json({ error: "no_rep" }, 400);
  const D = await loadDoc(rep.id);
  if (b.do === "approve") {
    const o = D.of.find((x) => x.id === b.id); if (!o) return json({ error: "not_found" }, 404);
    o.ap = b.ok ? "ok" : "no"; o.apBy = new Date().toISOString();
    await saveDoc(rep.id, D);
    return json({ ok: true, doc: D });
  }
  if (b.do === "move") {
    // Give a client (with its offers and visits) to another rep.
    const to = reps.find((x) => x.id === b.to); if (!to || to.id === rep.id) return json({ error: "no_rep" }, 400);
    const c = D.cl.find((x) => x.id === b.id); if (!c) return json({ error: "not_found" }, 404);
    if (D.vs.some((v) => v.cl === c.id && !v.out)) return json({ error: "open_visit" }, 409);
    const T = await loadDoc(to.id);
    T.cl.push(c); T.of.push(...D.of.filter((o) => o.cl === c.id)); T.vs.push(...D.vs.filter((v) => v.cl === c.id)); T.od.push(...D.od.filter((o) => o.cl === c.id));
    T.vs.sort((a, z) => (a.in < z.in ? -1 : 1));
    D.cl = D.cl.filter((x) => x.id !== c.id); D.of = D.of.filter((o) => o.cl !== c.id); D.vs = D.vs.filter((v) => v.cl !== c.id); D.od = D.od.filter((o) => o.cl !== c.id);
    await saveDoc(to.id, T); await saveDoc(rep.id, D);
    return json({ ok: true });
  }
  return json({ error: "bad_request" }, 400);
}
