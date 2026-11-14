/* Oxinab Command Center: competitor prices.
   Every pro-forma a client uploads in the catalogue to compare prices is kept, with the file itself and each line read
   from it. "Uploads" lists them one by one; "Price watch" groups the lines by Oxinab product so the lowest price seen
   at other suppliers sits next to ours. Uses helpers from admin.js ($, esc, api, toast, W, when, usd, TAB). */
let CM = null, CMERR = false;
const CMF = { q: "", view: "uploads", open: new Set() };
const CST = { cheaper: "Oxinab cheaper", more: "Competitor cheaper or same", noprice: "No Oxinab price", nocur: "Other currency", unpriced: "No price on their pro-forma", none: "Not in catalogue" };
const cmMoney = (v, c) => (c && c !== "USD" ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + esc(c) : usd(v));
const cmKB = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
const cmGap = (l) => (l.op && l.pu ? Math.round((l.op / l.pu - 1) * 100) : null);

async function cmLoad() {
  try { CM = (await api("/api/admin/compare")).list; CMERR = false; }
  catch (e) { if (e.status === 401) return; CMERR = true; CM = CM || []; }
  if (TAB === "competitors") cmpRender();
}
function cmMatch(r, q) {
  if (!q) return true;
  return [r.id, r.sup, r.docno, r.client?.name, r.client?.phone, r.file?.name, ...r.lines.map((l) => l.n + " " + l.code + " " + l.m)].join(" ").toLowerCase().includes(q);
}
function cmpRender() {
  const el = $("t-competitors");
  if (!CM) { el.innerHTML = '<p class="mu">Loading competitor pro-formas…</p>'; cmLoad(); return; }
  const lines = CM.flatMap((r) => r.lines);
  el.innerHTML = `<div class="sum"><button data-v="uploads"><b>${CM.length}</b><span>Pro-formas uploaded</span></button><button data-v="uploads"><b>${lines.length}</b><span>Items read</span></button><button data-v="watch"><b>${new Set(lines.filter((l) => l.m).map((l) => l.m)).size}</b><span>Our products quoted</span></button><button data-v="watch"><b style="color:var(--ok)">${lines.filter((l) => l.st === "cheaper").length}</b><span>Items where we are cheaper</span></button><button data-v="watch" class="x"><b>${lines.filter((l) => l.st === "more").length}</b><span>Items where they are cheaper</span></button></div>
<div class="bar"><input type="search" id="cmq" placeholder="Search supplier, client, product or file" value="${esc(CMF.q)}" aria-label="Search competitor pro-formas">
<select id="cmv" aria-label="View"><option value="uploads">Uploads</option><option value="watch">Price watch, by product</option></select>
<button class="btn" id="cmr">↻ Refresh</button><button class="btn" id="cmcsv">⬇ All lines (CSV)</button></div>
${CMERR ? '<div class="notice bad">Could not reach the server. Showing what was loaded before.</div>' : ""}<div id="cml"></div>
<p class="mu sm">Clients upload these with "Compare a pro-forma" in the catalogue. PDFs and photos are read by Claude, which needs <code>ANTHROPIC_API_KEY</code> in Vercel; without it only Excel and CSV files are read, and PDFs and photos are still kept here. Prices are per unit before VAT; LBP prices are converted at 89,500 LBP per dollar. "Our price" is the price when the client compared.</p>`;
  $("cmv").value = CMF.view;
  $("cmq").oninput = (e) => { CMF.q = e.target.value; cmList(); };
  $("cmv").onchange = (e) => { CMF.view = e.target.value; cmList(); };
  el.querySelector(".sum").onclick = (e) => { const b = e.target.closest("button[data-v]"); if (b) { CMF.view = b.dataset.v; $("cmv").value = CMF.view; cmList(); } };
  $("cmr").onclick = async () => { const b = $("cmr"); b.disabled = true; b.textContent = "Refreshing…"; await cmLoad(); };
  $("cmcsv").onclick = cmCsv;
  cmList();
}
function cmList() {
  const q = CMF.q.trim().toLowerCase(), box = $("cml");
  const rs = CM.filter((r) => cmMatch(r, q));
  if (!CM.length) { box.innerHTML = '<div class="panel"><p class="mu" style="margin:0">No pro-formas yet. They appear here when clients use "Compare a pro-forma" in the catalogue.</p></div>'; return; }
  if (CMF.view === "watch") return cmWatch(rs);
  box.innerHTML = rs.length ? rs.map((r) => {
    const s = r.stats || {}, tel = (r.client?.phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "").replace(/^0/, "961");
    return `<article class="ord" id="cm-${esc(r.id)}"><div><h3>${esc(r.sup || "Supplier not named")} <span class="mu sm">#${esc(r.id)}${r.docno ? " · " + esc(r.docno) : ""}${r.docdate ? " · " + esc(r.docdate) : ""}</span></h3>
${r.error ? `<p class="sm" style="margin:4px 0;color:var(--bad)">${{ needs_ai: "Not read: reading PDFs and photos needs ANTHROPIC_API_KEY in Vercel. Open the file to see it.", old_excel: "Not read: old Excel format (.xls). Open the file to see it.", unreadable: "Could not be read. Open the file to see it.", no_lines: "No item lines found in it. Open the file to see it." }[r.error] || esc(r.error)}</p>`
      : `<p class="sm" style="margin:4px 0">${s.items} items read · ${s.matched} found in our catalogue · <b style="color:var(--ok)">${s.cheaper} cheaper at Oxinab</b> · <b style="color:var(--bad)">${s.more} cheaper or same at them</b>${s.theirs ? ` · their total for our cheaper items ${usd(s.theirs)} vs ours ${usd(s.ours)}` : ""}</p>`}</div>
<div style="text-align:end"><a class="btn" href="/api/admin/compare?file=${esc(r.id)}" target="_blank" rel="noopener">📄 Open file</a></div>
<div class="meta"><span>🕒 ${when(r.at)}</span><span>👤 ${esc(r.client?.name || "No name given")}</span>${r.client?.phone ? `<span>📞 <a href="https://wa.me/${esc(tel)}" target="_blank" rel="noopener">${esc(r.client.phone)}</a></span>` : ""}<span>📎 ${esc(r.file?.name || "")} (${cmKB(r.file?.size || 0)})</span><span>${r.src === "ai" ? "Read by Claude" : r.src === "sheet" ? "Read from the spreadsheet" : ""}</span></div>
${r.lines.length ? `<details style="grid-column:1/-1" data-cm="${esc(r.id)}" ${CMF.open.has(r.id) ? "open" : ""}><summary class="sm" style="cursor:pointer;font-weight:700">Show the ${r.lines.length} lines</summary><div class="tw" style="margin-top:8px"><table><thead><tr><th>Their item</th><th>Qty</th><th>Their price</th><th>Our product</th><th>Our price</th><th>Difference</th></tr></thead><tbody>${r.lines.map(cmLine).join("")}</tbody></table></div></details>` : ""}</article>`;
  }).join("") : '<div class="panel"><p class="mu" style="margin:0">No pro-formas match this search.</p></div>';
  box.querySelectorAll("details[data-cm]").forEach((d) => (d.ontoggle = () => (d.open ? CMF.open.add(d.dataset.cm) : CMF.open.delete(d.dataset.cm))));
}
function cmLine(l) {
  const it = W.items.find((i) => i.id === l.m), g = cmGap(l);
  return `<tr><td>${esc(l.n)}${l.code ? `<small dir="ltr">${esc(l.code)}</small>` : ""}</td><td>${l.q}</td><td style="white-space:nowrap">${l.p ? cmMoney(l.p, l.cur) : "—"}${l.cur !== "USD" && l.pu ? `<small dir="ltr">${usd(l.pu)}</small>` : ""}</td>
<td>${l.m ? `<span class="ref">${esc(l.m)}</span> ${esc(it ? it.n : "")}${l.fit === "similar" ? ' <span class="pill low">similar</span>' : ""}` : '<span class="mu">Not in catalogue</span>'}</td><td>${l.op ? usd(l.op) : l.m ? '<span class="mu">no price</span>' : ""}</td>
<td>${g == null ? "" : `<b style="color:${g < 0 ? "var(--ok)" : "var(--bad)"}">${g > 0 ? "+" : ""}${g}%</b>`}</td></tr>`;
}
// By product: every competitor price seen for each Oxinab product, lowest first, next to today's price.
function cmWatch(rs) {
  const by = {};
  rs.forEach((r) => r.lines.forEach((l) => { if (!l.m || l.pu == null) return; (by[l.m] = by[l.m] || []).push({ ...l, sup: r.sup || "Supplier not named", at: r.at, rid: r.id }); }));
  const ids = Object.keys(by);
  const now = (id) => (W.items.find((i) => i.id === id) || {}).p || 0;
  const rows = ids.map((id) => { const a = by[id].sort((x, y) => x.pu - y.pu), lo = a[0], latest = [...a].sort((x, y) => y.at.localeCompare(x.at))[0]; return { id, a, lo, latest, ours: now(id) }; })
    .sort((x, y) => ((x.ours && x.lo.pu < x.ours ? 0 : 1) - (y.ours && y.lo.pu < y.ours ? 0 : 1)) || (x.lo.pu / (x.ours || x.lo.pu)) - (y.lo.pu / (y.ours || y.lo.pu)));
  $("cml").innerHTML = rows.length ? `<div class="tw"><table><thead><tr><th>Our product</th><th>Our price now</th><th>Lowest seen elsewhere</th><th>Latest seen</th><th>Quotes</th></tr></thead><tbody>${rows.map((r) => {
    const it = W.items.find((i) => i.id === r.id), g = r.ours ? Math.round((r.lo.pu / r.ours - 1) * 100) : null;
    return `<tr${r.ours && r.lo.pu < r.ours ? ' style="background:color-mix(in srgb,var(--bad) 8%,transparent)"' : ""}><td><span class="ref">${esc(r.id)}</span> ${esc(it ? it.n : "")}</td><td>${r.ours ? usd(r.ours) : '<span class="mu">no price</span>'}</td>
<td style="white-space:nowrap"><b>${usd(r.lo.pu)}</b>${g != null ? ` <span style="color:${g < 0 ? "var(--bad)" : "var(--ok)"}">(${g > 0 ? "+" : ""}${g}%)</span>` : ""}<small dir="auto">${esc(r.lo.sup)} · ${new Date(r.lo.at).toLocaleDateString()}</small></td>
<td style="white-space:nowrap">${usd(r.latest.pu)}<small dir="auto">${esc(r.latest.sup)} · ${new Date(r.latest.at).toLocaleDateString()}</small></td>
<td><a href="#" data-cmgo="${esc(r.a.map((x) => x.rid).filter((v, i, s) => s.indexOf(v) === i)[0])}">${r.a.length}</a></td></tr>`;
  }).join("")}</tbody></table></div><p class="mu sm">Rows in red: a competitor quoted less than our price today.</p>` : '<div class="panel"><p class="mu" style="margin:0">No matched prices yet.</p></div>';
}
function cmCsv() {
  const qv = (v) => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ["Date", "Comparison", "Supplier", "Pro-forma no.", "Client", "Client phone", "File", "Their item", "Their code", "Qty", "Their unit price", "Currency", "Their price ($)", "Our ref", "Our product", "Match", "Our price then ($)", "Result"];
  const rows = CM.flatMap((r) => r.lines.map((l) => [r.at.slice(0, 10), r.id, r.sup, r.docno, r.client?.name, r.client?.phone, r.file?.name, l.n, l.code, l.q, l.p, l.cur, l.pu, l.m, (W.items.find((i) => i.id === l.m) || {}).n || "", l.m ? l.fit : "", l.op || "", CST[l.st] || l.st]));
  bkSave(new Blob(["﻿" + [head, ...rows].map((r) => r.map(qv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), `oxinab-competitor-prices-${new Date().toISOString().slice(0, 10)}.csv`);
}
// From an order note ("Pro-forma comparison #ABC123") or the price watch: open that upload.
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-cmpgo],[data-cmgo]"); if (!a) return;
  e.preventDefault();
  const id = a.dataset.cmpgo || a.dataset.cmgo;
  CMF.view = "uploads"; CMF.q = id; CMF.open.add(id);
  document.querySelector('nav.tabs button[data-t="competitors"]').click();
});
