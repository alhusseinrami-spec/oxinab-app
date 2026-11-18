import { json, guard } from "../_lib.js";
import { cleanDoc, loadCfg, saveCfg, loadProformas, issueProforma } from "../_proforma.js";
import { salesGET, salesPOST } from "../_sales.js";

/* Proformas (quotes) sent to clients; the details are in _proforma.js.
   This route also serves the sales app (/api/sales is sent here with ?do=sales), since the free plan allows 12 routes. */
const isSales = (req) => new URL(req.url).searchParams.get("do") === "sales";

export async function GET(req) {
  if (isSales(req)) return salesGET(req);
  const g = guard(req); if (g) return g;
  const [cfg, docs] = await Promise.all([loadCfg(), loadProformas()]);
  return json({ cfg, docs });
}
// Save the company details: { cfg }
export async function PUT(req) {
  const g = guard(req); if (g) return g;
  let b = {}; try { b = await req.json(); } catch {}
  return json({ ok: true, cfg: await saveCfg(b.cfg) });
}
// Issue a proforma: { doc } → it gets the next number and is kept for re-downloading.
export async function POST(req) {
  if (isSales(req)) return salesPOST(req);
  const g = guard(req); if (g) return g;
  let b = {}; try { b = await req.json(); } catch {}
  let doc;
  try { doc = cleanDoc(b.doc); } catch (e) { return json({ error: "invalid", detail: e.message }, 400); }
  return json({ ok: true, doc: await issueProforma(doc) });
}
