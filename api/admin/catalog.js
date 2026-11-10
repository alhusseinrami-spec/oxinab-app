import { json, guard, loadCatalog, saveCatalog, cleanCatalog } from "../_lib.js";

export async function GET(req) {
  const g = guard(req); if (g) return g;
  const { data, version } = await loadCatalog();
  return json({ data, version });
}

// Publish: the whole catalogue is sent and replaces the live one. `base` must match the live version,
// so two people editing at once can't silently overwrite each other.
export async function PUT(req) {
  const g = guard(req); if (g) return g;
  const text = await req.text();
  if (text.length > 2_000_000) return json({ error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }
  const live = await loadCatalog();
  if (body.base && body.base !== live.version) return json({ error: "conflict", version: live.version }, 409);
  let clean;
  try { clean = cleanCatalog(body.data); } catch (e) { return json({ error: "invalid", detail: String(e.message) }, 400); }
  const version = await saveCatalog(clean);
  return json({ ok: true, version, data: clean });
}
