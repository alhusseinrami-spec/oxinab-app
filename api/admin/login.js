import { clearCookie, clearDriverCookie, driverCookie, json, checkPassword, passwordConfigured, sessionCookie, sameOrigin, blobReady } from "../_lib.js";
import { loadDrivers, checkPin, normPhone, pinVer } from "../_drivers.js";

const tries = new Map(); // best effort, per server instance
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  if (!passwordConfigured()) return json({ error: "not_set_up" }, 503);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const t = tries.get(ip) || { n: 0, until: 0 };
  if (t.until > Date.now()) return json({ error: "locked", minutes: Math.ceil((t.until - Date.now()) / 60000) }, 429);
  let body = {};
  try { body = await req.json(); } catch {}
  // A driver signing in to the driver app: { driver: phone, pin }
  if (body.driver !== undefined) {
    if (!blobReady()) return json({ error: "storage_not_connected" }, 503);
    const ph = normPhone(body.driver);
    const d = ph.length >= 6 ? (await loadDrivers()).find((x) => x.on && normPhone(x.tel) === ph) : null;
    if (!d || !checkPin(d, body.pin)) {
      t.n++;
      if (t.n >= 5) { t.until = Date.now() + 15 * 60e3; t.n = 0; }
      tries.set(ip, t);
      await wait(800);
      return json({ error: "wrong_pin" }, 401);
    }
    tries.delete(ip);
    return json({ ok: true, driver: { id: d.id, n: d.n } }, 200, { "set-cookie": driverCookie(d.id, pinVer(d)) });
  }
  if (!checkPassword(body.password)) {
    t.n++;
    if (t.n >= 5) { t.until = Date.now() + 15 * 60e3; t.n = 0; }
    tries.set(ip, t);
    await wait(800);
    return json({ error: "wrong_password" }, 401);
  }
  tries.delete(ip);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie() });
}

// Sign out (kept in this file: the Hobby plan allows 12 API routes).
// Signs out of both the command center and the driver app on this device.
export function DELETE() {
  const h = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  h.append("set-cookie", clearCookie()); h.append("set-cookie", clearDriverCookie());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
}
