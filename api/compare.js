// A client uploads a pro-forma from another supplier: keep a copy for Oxinab, read it, and say where Oxinab is cheaper.
// Body: the file itself. Headers: x-file (file name, URL-encoded), x-lang, x-who (URL-encoded JSON: name, phone).
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { json, blobReady, sameOrigin, loadCatalogFast as loadCatalog } from "./_lib.js";
import { seal, sealBytes } from "./_orders.js";
import { kindOf, MIME, aiOn, aiRead, readXlsx, readCsv, sheetText, sheetLines, fuzzyMatch, compare, stats } from "./_compare.js";

const MAX = 4_200_000;
const hits = new Map(); // best effort, per server instance: at most 12 files an hour from one address
const ts = () => String(Date.now()).padStart(15, "0");
const newId = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(randomBytes(6), (x) => c[x % c.length]).join(""); };
const str = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const dec = (v) => { try { return decodeURIComponent(v || ""); } catch { return ""; } };

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "bad_origin" }, 403);
  if (!blobReady()) return json({ error: "storage_not_connected" }, 503);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => t > now - 3600e3);
  if (h.length >= 12) return json({ error: "too_many" }, 429);
  hits.set(ip, [...h, now]);

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 20) return json({ error: "empty" }, 400);
  if (buf.length > MAX) return json({ error: "too_large" }, 413);
  const name = str(dec(req.headers.get("x-file")), 160) || "proforma";
  const kind = kindOf(buf, name);
  if (!kind) return json({ error: "type" }, 415);
  let who = {}; try { who = JSON.parse(dec(req.headers.get("x-who")) || "{}"); } catch {}
  const id = newId(), lang = req.headers.get("x-lang") === "ar" ? "ar" : "en";

  // 1. Keep the file first, whatever happens next.
  const fp = (await put(`cmpf/${id}.bin`, sealBytes(buf), { access: "public", addRandomSuffix: true, contentType: "application/octet-stream" })).pathname;
  const rec = {
    id, at: new Date().toISOString(), lang,
    client: { name: str(who.name, 80), phone: str(who.phone, 30) },
    file: { name, kind, type: MIME[kind], size: buf.length, path: fp },
    src: "", sup: "", docno: "", docdate: "", lines: [], stats: null, error: "",
  };
  const finish = async (status, body) => {
    try { await put(`cmp/${ts()}-${id}.json`, seal(rec), { access: "public", addRandomSuffix: true, contentType: "application/json", cacheControlMaxAge: 31536000 }); }
    catch (e) { console.error("compare.save_failed", id, String(e)); }
    return json({ id, ...body }, status);
  };

  // 2. Read it.
  const { data } = await loadCatalog();
  const items = data.items.filter((i) => !i.off);
  let read = null;
  try {
    if (kind === "xls") { rec.error = "old_excel"; return finish(422, { error: "old_excel" }); }
    if (kind === "xlsx" || kind === "csv") {
      const sheets = kind === "xlsx" ? readXlsx(buf) : readCsv(buf.toString("utf8"));
      if (aiOn()) { try { read = await aiRead({ kind, text: sheetText(sheets), items }); rec.src = "ai"; } catch (e) { console.error("compare.ai_failed", id, String(e)); } }
      if (!read || !read.lines?.length) { read = sheetLines(sheets); if (read) { fuzzyMatch(read.lines, items); rec.src = "sheet"; } }
    } else {
      if (!aiOn()) { rec.error = "needs_ai"; return finish(422, { error: "needs_ai" }); }
      read = await aiRead({ kind, buf, items }); rec.src = "ai";
    }
  } catch (e) {
    console.error("compare.read_failed", id, kind, String(e));
    rec.error = "unreadable"; return finish(422, { error: "unreadable" });
  }
  if (!read || !read.lines?.length) { rec.error = "no_lines"; return finish(422, { error: "no_lines" }); }

  // 3. Compare. Oxinab's prices go back to the client only when the catalogue shows prices.
  rec.sup = str(read.supplier, 120); rec.docno = str(read.doc_no, 60); rec.docdate = str(read.doc_date, 40);
  rec.lines = compare(read, items); rec.stats = stats(rec.lines);
  const show = !!data.set.price;
  const lines = rec.lines.map(({ op, ...l }) => (show ? { ...l, op } : l));
  console.log("compare.done", id, kind, rec.src, JSON.stringify(rec.stats));
  return finish(200, { sup: rec.sup, docno: rec.docno, docdate: rec.docdate, lines, stats: show ? rec.stats : { ...rec.stats, ours: null, theirs: null }, prices: show });
}
