import { randomBytes } from "node:crypto";
import { json, guard, isAdmin, driverFromReq, sameOrigin, blobReady } from "../_lib.js";
import { notifyOrder, loadOrders, applyStatus, setEta, updateTrack, findOrder, getState, setState, STATUSES, ORDER_ID } from "../_orders.js";
import { loadDrivers, saveDrivers, hashPin, normPhone, pinVer, publicDriver } from "../_drivers.js";
import { kvOn, kvSet } from "../_kv.js";

/* One route for the command center and the driver app (the free plan allows 12 routes).
   Command center (admin cookie): orders, statuses, delivery times, drivers and who delivers what.
   Driver app (driver cookie): the driver's own deliveries, starting and finishing them, and their location while delivering. */

async function driverGuard(req) {
  const me = driverFromReq(req);
  if (!me) return { err: json({ error: "signed_out" }, 401) };
  if (req.method !== "GET" && !sameOrigin(req)) return { err: json({ error: "bad_origin" }, 403) };
  if (!blobReady()) return { err: json({ error: "storage_not_connected" }, 503) };
  const d = (await loadDrivers()).find((x) => x.id === me.id);
  if (!d || !d.on || pinVer(d) !== me.pv) return { err: json({ error: "signed_out" }, 401) };
  return { d };
}
const DAY = 864e5;
// A driver sees deliveries that are still to do, and the ones finished in the last day.
const myJobs = (as, id) => Object.entries(as || {}).filter(([, j]) => j.d === id && (!["delivered", "cancelled"].includes(j.st) || Date.now() - (j.stAt || 0) < DAY))
  .map(([oid, j]) => ({ id: oid, st: j.st, n: j.n, tel: j.tel, addr: j.addr, note: j.note, items: j.items, total: j.total, at: j.at }))
  .sort((a, b) => (a.at < b.at ? -1 : 1));

// The driver app adds ?as=driver, so a phone signed in to both uses its driver account there.
const asDriver = (req) => !isAdmin(req) || new URL(req.url).searchParams.get("as") === "driver";
export async function GET(req) {
  if (asDriver(req)) {
    const { d, err } = await driverGuard(req); if (err) return err;
    return json({ me: { id: d.id, n: d.n }, jobs: myJobs(await getState("assign"), d.id), live: kvOn() });
  }
  const g = guard(req); if (g) return g;
  const [orders, drivers, as] = await Promise.all([loadOrders(), loadDrivers(), getState("assign")]);
  orders.forEach((o) => { if (as && as[o.id]) o.drv = as[o.id].d; });
  return json({ orders, statuses: STATUSES, drivers: drivers.map(publicDriver), live: kvOn() });
}

export async function POST(req) {
  let b = {};
  if (asDriver(req)) {
    // Driver: { id, status: "out" | "delivered" } for one of their own deliveries.
    const { d, err } = await driverGuard(req); if (err) return err;
    try { b = await req.json(); } catch {}
    const as = (await getState("assign")) || {}, j = as[b.id];
    if (!j || j.d !== d.id || !["out", "delivered"].includes(b.status)) return json({ error: "bad_request" }, 400);
    if (["delivered", "cancelled"].includes(j.st)) return json({ error: "closed" }, 409);
    await applyStatus(b.id, b.status);
    console.log("driver.status", d.id, b.id, b.status);
    return json({ ok: true });
  }
  const g = guard(req); if (g) return g;
  try { b = await req.json(); } catch {}

  // Drivers list: { drivers: [{ id?, n, tel, pin?, on }] }. A PIN is only sent when it is new or changed.
  if (Array.isArray(b.drivers)) {
    const old = await loadDrivers(), out = [];
    for (const x of b.drivers.slice(0, 50)) {
      const n = String(x.n || "").trim().slice(0, 40), tel = String(x.tel || "").trim().slice(0, 30);
      if (!n || normPhone(tel).length < 6) return json({ error: "bad_driver", detail: n || tel }, 400);
      const prev = old.find((o) => o.id === x.id);
      const pin = x.pin ? String(x.pin) : "";
      if (pin && !/^\d{4,8}$/.test(pin)) return json({ error: "bad_pin", detail: n }, 400);
      if (!prev && !pin) return json({ error: "pin_needed", detail: n }, 400);
      if (out.some((o) => normPhone(o.tel) === normPhone(tel))) return json({ error: "same_phone", detail: n }, 400);
      out.push({ id: prev ? prev.id : randomBytes(5).toString("hex"), n, tel, on: x.on ? 1 : 0, ...(pin ? hashPin(pin) : { salt: prev.salt, hash: prev.hash }) });
    }
    await saveDrivers(out);
    return json({ ok: true, drivers: out.map(publicDriver) });
  }

  const id = String(b.id || "");
  if (!ORDER_ID.test(id)) return json({ error: "bad_request" }, 400);

  // Who delivers an order: { id, driver: "<driver id>" | "" }
  if (b.driver !== undefined) {
    const as = (await getState("assign")) || {};
    let drv = null;
    if (b.driver) {
      drv = (await loadDrivers()).find((x) => x.id === b.driver);
      if (!drv) return json({ error: "no_driver" }, 400);
      const o = await findOrder(id);
      if (!o) return json({ error: "order_not_found" }, 404);
      const cur = as[id] || {};
      as[id] = { d: drv.id, n: o.name, tel: o.phone, addr: o.addr, note: o.note, items: o.items.map((i) => ({ n: i.n, q: i.q })), total: o.total, at: o.at, st: cur.st || b.status || "new", stAt: cur.stAt || Date.now() };
    } else delete as[id];
    // Forget finished deliveries after a week.
    for (const [k, j] of Object.entries(as)) if (["delivered", "cancelled"].includes(j.st) && Date.now() - (j.stAt || 0) > 7 * DAY) delete as[k];
    await setState("assign", as);
    await updateTrack(id, (t) => { if (drv) t.driver = { id: drv.id, n: drv.n.split(" ")[0], tel: drv.tel }; else delete t.driver; }).catch(() => null);
    return json({ ok: true });
  }

  /* Change an order: { id, status } and/or { id, eta } (an ISO date and time, or "" to clear it).
     The client's tracking page is updated at the same time. */
  const hasStatus = b.status !== undefined, hasEta = b.eta !== undefined;
  if (!hasStatus && !hasEta) return json({ error: "bad_request" }, 400);
  if (hasStatus && !STATUSES.includes(b.status)) return json({ error: "bad_request" }, 400);
  let eta = "";
  if (hasEta && b.eta) { const t = Date.parse(b.eta); if (!isFinite(t)) return json({ error: "bad_eta" }, 400); eta = new Date(t).toISOString(); }
  let tracked = true;
  if (hasStatus) tracked = await applyStatus(id, b.status);
  if (hasEta) {
    await setEta(id, eta);
    let doc = null, changedEta = false;
    tracked = !!(await updateTrack(id, (d) => { changedEta = d.eta !== eta; d.eta = eta; doc = d; }).catch(() => null)) && tracked;
    // Tell the client about a new delivery time once the order is confirmed (a "new" order gets it in the confirmation).
    if (eta && changedEta && doc && ["confirmed", "preparing", "out"].includes(doc.status) && !(hasStatus && b.status === "confirmed")) await notifyOrder(id, "eta", doc);
  }
  return json({ ok: true, tracked });
}

// Driver's location while delivering: { lat, lng, acc, hd, sp }. Kept 3 minutes; clients see it only while their order is out for delivery.
export async function PUT(req) {
  const { d, err } = await driverGuard(req); if (err) return err;
  if (!kvOn()) return json({ error: "no_live_store" }, 503);
  let b = {}; try { b = await req.json(); } catch {}
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "bad_location" }, 400);
  const r5 = (v) => Math.round(v * 1e5) / 1e5, num = (v) => (isFinite(Number(v)) && v !== null ? Math.round(Number(v)) : null);
  await kvSet("loc:" + d.id, { lat: r5(lat), lng: r5(lng), acc: num(b.acc), hd: num(b.hd), sp: num(b.sp), t: Date.now() }, 180);
  return json({ ok: true });
}
