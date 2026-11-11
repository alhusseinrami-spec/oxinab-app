// Order log. Each order is one file orders/<time>-<number>.json, encrypted so only this server can read it
// (the storage is public-URL, and orders hold customers' names and phone numbers).
// A status change adds a tiny file ostat/<number>/<time>-<status>.json; the newest one wins.
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { listAll } from "./_lib.js";

export const STATUSES = ["new", "confirmed", "delivered", "cancelled"];
export const ORDER_ID = /^[A-Z0-9]{6}$/;
const key = () => createHash("sha256").update("oxinab-orders:" + (process.env.ORDERS_KEY || process.env.BLOB_READ_WRITE_TOKEN || "")).digest();
const ts = () => String(Date.now()).padStart(15, "0");

export function seal(obj) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
}
export function open(text) {
  const o = JSON.parse(text), d = createDecipheriv("aes-256-gcm", key(), Buffer.from(o.iv, "base64"));
  d.setAuthTag(Buffer.from(o.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, "base64")), d.final()]).toString("utf8"));
}

export async function saveOrder(order) {
  await put(`orders/${ts()}-${order.id}.json`, seal(order), { access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 31536000 });
}
export async function setStatus(id, status) {
  await put(`ostat/${id}/${ts()}-${status}.json`, "{}", { access: "public", addRandomSuffix: true, contentType: "application/json" });
}

export async function loadOrders(limit = 300) {
  const files = (await listAll("orders/")).sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, limit);
  const stat = {};
  for (const b of (await listAll("ostat/")).sort((a, b) => a.pathname.localeCompare(b.pathname))) {
    const m = b.pathname.match(/^ostat\/([A-Z0-9]{6})\/\d+-(\w+)/);
    if (m && STATUSES.includes(m[2])) stat[m[1]] = m[2];
  }
  const out = [];
  for (let i = 0; i < files.length; i += 20) {
    out.push(...await Promise.all(files.slice(i, i + 20).map(async (f) => {
      try {
        const r = await fetch(f.url);
        if (!r.ok) return null;
        const o = open(await r.text());
        return { ...o, status: stat[o.id] || "new" };
      } catch { return null; }
    })));
  }
  return out.filter(Boolean);
}
