import { json, guard } from "../_lib.js";
import { loadOrders, setStatus, STATUSES, ORDER_ID } from "../_orders.js";

export async function GET(req) {
  const g = guard(req); if (g) return g;
  return json({ orders: await loadOrders(), statuses: STATUSES });
}
// Change an order's status: { id, status }
export async function POST(req) {
  const g = guard(req); if (g) return g;
  let b = {};
  try { b = await req.json(); } catch {}
  if (!ORDER_ID.test(String(b.id || "")) || !STATUSES.includes(b.status)) return json({ error: "bad_request" }, 400);
  await setStatus(b.id, b.status);
  return json({ ok: true });
}
