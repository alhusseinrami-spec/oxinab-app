import { json, loadCatalog } from "./_lib.js";
import SEED from "./_seed.js";

// Public: the live catalogue. Cached briefly at the edge so a change reaches phones within about 15 seconds.
export async function GET() {
  let data = SEED;
  try { data = (await loadCatalog()).data; } catch (e) { console.error("catalog.load_failed", String(e)); }
  return json(data, 200, { "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=300" });
}
