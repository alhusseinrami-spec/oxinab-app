// Redis (Upstash, added from Vercel Storage) for things that change every few seconds: order progress and drivers' locations.
// Spoken to over its REST interface, so no extra package is needed. Without it the app still works, without the live map.
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const tok = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const kvOn = () => !!(url() && tok());
async function call(path, body) {
  const r = await fetch(url().replace(/\/$/, "") + path, { method: "POST", headers: { authorization: "Bearer " + tok(), "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "kv_http_" + r.status }));
  if (!r.ok || j.error) throw new Error("kv: " + (j.error || r.status));
  return j;
}
export const kv = async (...cmd) => (await call("", cmd.map(String))).result;
export const kvPipe = async (cmds) => (await call("/pipeline", cmds.map((c) => c.map(String)))).map((x) => { if (x.error) throw new Error("kv: " + x.error); return x.result; });
export const kvGet = async (k) => { const v = await kv("GET", k); return v ? JSON.parse(v) : null; };
export const kvSet = (k, v, ex) => kv("SET", k, JSON.stringify(v), ...(ex ? ["EX", ex] : []));
