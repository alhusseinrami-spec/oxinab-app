import { clearCookie, json, checkPassword, passwordConfigured, sessionCookie, sameOrigin } from "../_lib.js";

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
export function DELETE() { return json({ ok: true }, 200, { "set-cookie": clearCookie() }); }
