import { json, guard, listAll } from "../_lib.js";
import { open, openBytes } from "../_orders.js";

/* GET /api/admin/compare (rewritten to /api/admin/orders?do=compare, to stay within the 12 functions of the Vercel Hobby plan).
   Pro-formas that clients uploaded to compare prices (see /api/compare).
   GET            → the latest 300 comparisons, newest first, with every line read and Oxinab's price at the time.
   GET ?file=<id> → the original file the client uploaded, to open or download. */
export async function compareList(req) {
  const g = guard(req); if (g) return g;
  const q = new URL(req.url).searchParams, fid = q.get("file");
  if (fid) {
    if (!/^[A-Z0-9]{6}$/.test(fid)) return json({ error: "bad_request" }, 400);
    const recs = await listAll(`cmp/`);
    const rf = recs.find((b) => b.pathname.includes(`-${fid}-`) || b.pathname.includes(`-${fid}.`));
    const files = await listAll(`cmpf/${fid}`);
    if (!files.length) return json({ error: "not_found" }, 404);
    const r = await fetch(files[0].url, { cache: "no-store" });
    if (!r.ok) return json({ error: "not_found" }, 404);
    const body = openBytes(Buffer.from(await r.arrayBuffer()));
    let name = `proforma-${fid}`, type = "application/octet-stream";
    if (rf) { try { const rec = open(await (await fetch(rf.url, { cache: "no-store" })).text()); name = rec.file.name || name; type = rec.file.type || type; } catch {} }
    const safe = name.replace(/[^\w.\- ()]+/g, "_");
    return new Response(body, { headers: { "content-type": type, "content-disposition": `${/^(application\/pdf|image\/(jpeg|png|webp))$/.test(type) ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  const files = (await listAll("cmp/")).sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, 300);
  const out = [];
  for (let i = 0; i < files.length; i += 20) {
    out.push(...await Promise.all(files.slice(i, i + 20).map(async (f) => {
      try { const r = await fetch(f.url); return r.ok ? open(await r.text()) : null; } catch { return null; }
    })));
  }
  return json({ list: out.filter(Boolean) });
}
