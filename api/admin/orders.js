import { json, guard } from "../_lib.js";
import { loadOrders, setStatus, setEta, updateTrack, STATUSES, STEPS, ORDER_ID } from "../_orders.js";

export async function GET(req) {
  const g = guard(req); if (g) return g;
  return json({ orders: await loadOrders(), statuses: STATUSES });
}
/* Change an order: { id, status } and/or { id, eta } (an ISO date and time, or "" to clear it).
   The client's tracking page is updated at the same time. */
export async function POST(req) {
  const g = guard(req); if (g) return g;
  let b = {};
  try { b = await req.json(); } catch {}
  const id = String(b.id || "");
  const hasStatus = b.status !== undefined, hasEta = b.eta !== undefined;
  if (!ORDER_ID.test(id) || (!hasStatus && !hasEta)) return json({ error: "bad_request" }, 400);
  if (hasStatus && !STATUSES.includes(b.status)) return json({ error: "bad_request" }, 400);
  let eta = "";
  if (hasEta && b.eta) { const t = Date.parse(b.eta); if (!isFinite(t)) return json({ error: "bad_eta" }, 400); eta = new Date(t).toISOString(); }
  if (hasStatus) await setStatus(id, b.status);
  if (hasEta) await setEta(id, eta);
  let tracked = true;
  try {
    tracked = !!(await updateTrack(id, (d) => {
      const now = new Date().toISOString();
      if (hasStatus && d.status !== b.status) {
        d.status = b.status;
        if (b.status !== "cancelled") {
          // Moving back a step clears the later steps; moving forward fills any skipped step with the same time.
          const k = STEPS.indexOf(b.status);
          STEPS.forEach((s, i) => { if (i > k) delete d.steps[s]; else if (!d.steps[s]) d.steps[s] = now; });
        } else d.steps.cancelled = now;
        if (b.status !== "cancelled") delete d.steps.cancelled;
      }
      if (hasEta) d.eta = eta;
    }));
  } catch (e) { console.error("track.update_failed", id, e && e.message); tracked = false; }
  return json({ ok: true, tracked });
}
