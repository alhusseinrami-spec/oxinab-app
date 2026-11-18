/* Command Center: Sales team tab. Accounts for the sales app (/sales) with what each one may use,
   discount approvals, this month's numbers per rep, visits (check-ins), a map, and all clients and leads.
   Uses the helpers in admin.js ($, esc, api, toast, ME, TAB). */
let SA = null, SAERR = false, SAMAP = null, SAPINS = null;
const SAF = { q: "", rep: "all", kind: "all" };
const SA_STAGE = { new: "New", contacted: "Contacted", interested: "Interested", offer: "Offer given", won: "Won", lost: "Lost" };
const SA_RES = { order: "Order placed", offer: "Offer given", followup: "Follow-up needed", nointerest: "Not interested", other: "Other" };
const saUsd = (v) => "$" + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const saUsd0 = (v) => "$" + Math.round(Number(v || 0)).toLocaleString("en-US");
const saDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
const saWhen = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const saTotal = (o) => { const sub = o.lines.reduce((s, l) => s + l.q * l.p, 0), b = sub - Math.min(o.disc || 0, sub) + (o.ship || 0); return b + b * (o.vat || 0) / 100; };

async function salesLoad() {
  try { SA = await api("/api/sales?as=admin"); SAERR = false; }
  catch (e) { SAERR = true; if (e.status === 401) return; SA = SA || null; }
  const n = SA ? Object.values(SA.docs).reduce((s, d) => s + d.of.filter((o) => o.ap === "wait").length, 0) : 0;
  $("sbadge").hidden = !n; $("sbadge").textContent = n;
  if (TAB === "sales") salesRender();
}
function salesRender() {
  const el = $("t-sales");
  if (!SA) { el.innerHTML = SAERR ? '<div class="notice bad">Could not load the sales team. <button class="btn" onclick="salesLoad()">Try again</button></div>' : '<p class="mu">Loading the sales team…</p>'; if (!SAERR) salesLoad(); return; }
  const reps = SA.reps, docs = SA.docs, name = (id) => (reps.find((r) => r.id === id) || { n: "?" }).n;
  const m = saDay(Date.now()).slice(0, 7), t = saDay(Date.now());
  const all = (k) => reps.flatMap((r) => (docs[r.id] ? docs[r.id][k] : []).map((x) => ({ ...x, rep: r.id })));
  const cl = all("cl"), of = all("of"), vs = all("vs"), od = all("od");
  const cname = (rep, id) => ((docs[rep] && docs[rep].cl.find((c) => c.id === id)) || { n: "Client removed" }).n;
  const wait = of.filter((o) => o.ap === "wait");

  const stats = reps.map((r) => {
    const d = docs[r.id] || { cl: [], of: [], vs: [], od: [] }, mo = d.od.filter((o) => saDay(o.at).slice(0, 7) === m);
    const sales = mo.reduce((s, o) => s + (o.total || 0), 0);
    return `<tr><td><b>${esc(r.n)}</b>${r.on ? "" : ' <span class="pill none">off</span>'}</td><td style="text-align:end">${saUsd0(sales)}</td><td style="min-width:120px">${r.tgt ? `<div style="background:var(--soft);border-radius:99px;height:8px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, Math.round(sales / r.tgt * 100))}%;background:var(--ok)"></i></div><span class="mu sm">${Math.round(sales / r.tgt * 100)}% of ${saUsd0(r.tgt)}</span>` : '<span class="mu sm">No target</span>'}</td>
<td style="text-align:end">${mo.length}</td><td style="text-align:end">${d.vs.filter((v) => saDay(v.in).slice(0, 7) === m).length} <span class="mu sm">(${d.vs.filter((v) => saDay(v.in) === t).length} today)</span></td><td style="text-align:end">${d.cl.filter((c) => c.st === "client").length}</td><td style="text-align:end">${d.cl.filter((c) => c.st === "lead" && c.stg !== "lost").length}</td><td style="text-align:end">${d.of.filter((o) => o.st === "open" || o.st === "sent").length}</td><td style="text-align:end">${d.cl.filter((c) => c.nx && c.nx < t).length || ""}</td></tr>`;
  }).join("");

  const pipe = Object.keys(SA_STAGE).map((s) => `<button data-st="${s}"><b>${cl.filter((c) => c.st === "lead" && c.stg === s).length}</b><span>Leads: ${SA_STAGE[s]}</span></button>`).join("");

  el.innerHTML = `<div class="notice">Sales reps (and you) use <b>/sales</b> on this site${location.host.includes("oxinab") ? "" : ""}: open <a href="/sales" target="_blank" rel="noopener">the sales app ↗</a> on a phone and sign in with the phone number and PIN set below. Each account has its own switches, so you can keep everything on for yourself and give a new rep fewer.</div>
<div id="sa-acc"></div>
${wait.length ? `<div class="panel" style="max-width:none;margin-top:14px;border-color:var(--warn)"><h2 style="font-size:18px">Discounts waiting for approval (${wait.length})</h2>${wait.map((o) => `<div class="dle"><div class="row"><b>${esc(cname(o.rep, o.cl))}</b><span class="mu sm">by ${esc(name(o.rep))} · ${saWhen(o.apAt || o.up)}</span><span class="sp"></span><b>${saUsd(saTotal(o))}</b><span class="pill low">${o.extra}% below standard (limit ${(reps.find((r) => r.id === o.rep) || {}).mx || 0}%)</span></div>
<ul style="margin:0;padding-inline-start:18px">${o.lines.map((l) => `<li>${l.q} × ${esc(l.n)} at ${saUsd(l.p)}${l.b && l.b !== l.p ? ` <span class="mu sm">(standard ${saUsd(l.b)})</span>` : ""}</li>`).join("")}${o.disc ? `<li>Extra discount −${saUsd(o.disc)}</li>` : ""}</ul>
<div class="row"><button class="btn pri" data-ap="1" data-rep="${o.rep}" data-id="${o.id}">✓ Approve</button><button class="btn dng" data-ap="0" data-rep="${o.rep}" data-id="${o.id}">✕ Decline</button></div></div>`).join("")}</div>` : ""}
<h2 style="font-size:18px;margin:18px 0 8px">This month</h2>
${reps.length ? `<div class="tw"><table><thead><tr><th>Rep</th><th style="text-align:end">Sales</th><th>Target</th><th style="text-align:end">Orders</th><th style="text-align:end">Visits</th><th style="text-align:end">Clients</th><th style="text-align:end">Open leads</th><th style="text-align:end">Open offers</th><th style="text-align:end">Overdue follow-ups</th></tr></thead><tbody>${stats}</tbody></table></div>` : '<p class="mu">Add an account above to start.</p>'}
<div class="sum" style="margin-top:14px">${pipe}</div>
<h2 style="font-size:18px;margin:18px 0 8px">Map</h2><div class="row sm mu" style="margin-bottom:6px"><span>🔵 Client</span><span>🟠 Lead</span><span>🟢 Check-in today</span></div><div id="sa-map" style="height:420px;border-radius:14px;border:1px solid var(--bd);overflow:hidden;background:var(--soft)"></div>
<h2 style="font-size:18px;margin:18px 0 8px">Recent visits</h2>
${vs.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Rep</th><th>Client</th><th>Time there</th><th>Result</th><th>Where</th><th>Notes</th></tr></thead><tbody>${vs.sort((a, b) => (a.in < b.in ? 1 : -1)).slice(0, 40).map((v) => `<tr><td>${saWhen(v.in)}</td><td>${esc(name(v.rep))}</td><td>${esc(cname(v.rep, v.cl))}</td><td>${v.out ? Math.max(1, Math.round((Date.parse(v.out) - Date.parse(v.in)) / 60000)) + " min" : '<span class="pill" style="background:#e3f6eb;color:#147a3d">there now</span>'}</td><td>${v.res ? SA_RES[v.res] : ""}</td><td>${v.lat === null ? '<span class="mu sm">no location</span>' : v.d === null ? '<span class="mu sm">first visit, place saved</span>' : v.d > 300 ? `<span class="pill out">${v.d >= 1000 ? (v.d / 1000).toFixed(1) + " km" : v.d + " m"} away</span>` : `<span class="mu sm">at the client (${v.d} m)</span>`}</td><td class="sm">${esc(v.note)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="mu">No visits yet.</p>'}
<h2 style="font-size:18px;margin:18px 0 8px">All clients and leads</h2>
<div class="bar"><input type="search" id="saq" placeholder="Search name, phone, area" value="${esc(SAF.q)}"><select id="sarep"><option value="all">All reps</option>${reps.map((r) => `<option value="${r.id}">${esc(r.n)}</option>`).join("")}</select><select id="sakind"><option value="all">Clients and leads</option><option value="client">Clients</option><option value="lead">Leads</option></select></div>
<div class="tw"><table><thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Area</th><th>Next follow-up</th><th>Ordered</th><th>Rep</th></tr></thead><tbody id="sacl"></tbody></table></div>`;
  $("sarep").value = SAF.rep; $("sakind").value = SAF.kind;
  const drawCl = () => {
    const q = SAF.q.trim().toLowerCase();
    const L = cl.filter((c) => (SAF.rep === "all" || c.rep === SAF.rep) && (SAF.kind === "all" || c.st === SAF.kind) && (!q || [c.n, c.co, c.tel, c.area, c.addr].join(" ").toLowerCase().includes(q))).sort((a, b) => a.n.localeCompare(b.n));
    $("sacl").innerHTML = L.slice(0, 300).map((c) => `<tr><td><b>${esc(c.n)}</b>${c.co ? `<small style="direction:ltr">${esc(c.co)}</small>` : ""}</td><td>${c.st === "lead" ? `<span class="pill low">Lead · ${SA_STAGE[c.stg]}</span>` : '<span class="pill" style="background:var(--soft)">Client</span>'} <span class="mu sm">${esc(c.k)}</span></td><td dir="ltr">${esc(c.tel)}</td><td>${esc(c.area)}</td><td>${c.nx ? `<span class="${c.nx < t ? "st-cancelled" : ""}">${esc(c.nx)}</span>` : ""}</td><td>${saUsd0(od.filter((o) => o.rep === c.rep && o.cl === c.id).reduce((s, o) => s + (o.total || 0), 0))}</td><td><select data-mv="${c.id}" data-from="${c.rep}" aria-label="Rep for ${esc(c.n)}">${reps.map((r) => `<option value="${r.id}" ${r.id === c.rep ? "selected" : ""}>${esc(r.n)}</option>`).join("")}</select></td></tr>`).join("") || '<tr><td colspan="7" class="mu">No clients or leads yet.</td></tr>';
  };
  drawCl();
  $("saq").oninput = (e) => { SAF.q = e.target.value; drawCl(); };
  $("sarep").onchange = (e) => { SAF.rep = e.target.value; drawCl(); };
  $("sakind").onchange = (e) => { SAF.kind = e.target.value; drawCl(); };
  $("sacl").onchange = async (e) => {
    const s = e.target.closest("[data-mv]"); if (!s) return;
    s.disabled = true;
    try { await api("/api/sales?as=admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ do: "move", rep: s.dataset.from, id: s.dataset.mv, to: s.value }) }); toast("Client moved, with its offers and visits."); await salesLoad(); }
    catch (err) { s.value = s.dataset.from; s.disabled = false; if (err.status !== 401) toast(err.message === "open_visit" ? "The rep is checked in there right now. Try after they check out." : "Could not move the client."); }
  };
  el.querySelectorAll("[data-ap]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api("/api/sales?as=admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ do: "approve", rep: b.dataset.rep, id: b.dataset.id, ok: b.dataset.ap === "1" }) }); toast(b.dataset.ap === "1" ? "Approved. The rep can make the proforma or order now." : "Declined. The rep sees it in the app."); await salesLoad(); }
    catch (err) { b.disabled = false; if (err.status !== 401) toast("Could not save. Try again."); }
  }));
  saAccounts();
  saMap(cl, vs.filter((v) => saDay(v.in) === t && v.lat !== null));
}

/* Accounts: name, phone, PIN, target, discount limit and the feature switches. */
function saAccounts() {
  const el = $("sa-acc"), F = SA.features;
  const ed = SA.reps.map((r) => ({ ...r, f: { ...r.f }, pin: "" }));
  const neu = { n: "", tel: "", pin: "", tgt: 0, mx: 0, on: true, f: Object.fromEntries(Object.keys(F).map((k) => [k, k === "gps" ? 0 : 1])) };
  const card = (r, i) => `<div class="dle" data-i="${i}"><div class="g2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
<label class="f">Name<input data-k="n" value="${esc(r.n)}" maxlength="40" placeholder="${i < 0 ? "New account name" : ""}"></label>
<label class="f">Phone<input data-k="tel" value="${esc(r.tel)}" maxlength="30" dir="ltr"></label>
<label class="f">PIN (4–8 digits)<input data-k="pin" inputmode="numeric" maxlength="8" placeholder="${i < 0 ? "PIN" : "unchanged"}"></label>
<label class="f">Monthly target $<input data-k="tgt" type="number" min="0" step="100" value="${r.tgt || ""}" placeholder="none"></label>
<label class="f">Discount limit %<input data-k="mx" type="number" min="0" max="90" step="0.5" value="${r.mx || 0}"></label></div>
<div class="row" style="gap:6px 14px;margin-top:4px">${Object.keys(F).map((k) => `<label class="row sm" style="gap:6px"><span class="sw"><input type="checkbox" data-f="${k}" ${r.f[k] ? "checked" : ""}><i></i></span>${esc(F[k])}</label>`).join("")}</div>
<label class="row sm" style="gap:6px;font-weight:700"><span class="sw"><input type="checkbox" data-k="on" ${r.on ? "checked" : ""}><i></i></span>Account can sign in</label></div>`;
  el.innerHTML = `<div class="panel" style="max-width:none"><div class="row"><h2 style="font-size:18px">Accounts</h2><span class="sp"></span><a class="btn" href="/sales" target="_blank" rel="noopener">Open the sales app ↗</a></div>
<p class="mu sm" style="margin:0">"Discount limit" is how far below the standard prices an offer can go before you approve it here (it only applies with that switch on). With "Change prices in offers" off, the rep can only use the standard prices.</p>
${ed.map(card).join("")}<details${ed.length ? "" : " open"}><summary>+ Add an account</summary>${card(neu, -1)}</details>
<div class="row"><button class="btn pri" id="sasave" disabled>Save accounts</button><span class="mu sm" id="samsg"></span></div></div>`;
  el.oninput = el.onchange = (e) => {
    const t = e.target, box = t.closest("[data-i]"); if (!box) return;
    const i = +box.dataset.i, r = i < 0 ? neu : ed[i];
    if (t.dataset.f) r.f[t.dataset.f] = t.checked ? 1 : 0;
    else if (t.dataset.k) r[t.dataset.k] = t.type === "checkbox" ? t.checked : t.value.trim();
    $("sasave").disabled = false; $("samsg").textContent = "Not saved yet";
  };
  $("sasave").onclick = async () => {
    const list = ed.map((r) => ({ ...r, pin: r.pin || undefined }));
    if (neu.n || neu.tel || neu.pin) {
      if (!neu.n || !neu.tel || !/^\d{4,8}$/.test(neu.pin)) { $("samsg").textContent = "A new account needs a name, a phone number and a PIN of 4 to 8 digits."; return; }
      list.push(neu);
    }
    if (list.some((r) => r.pin && !/^\d{4,8}$/.test(r.pin))) { $("samsg").textContent = "A PIN is 4 to 8 digits."; return; }
    $("sasave").disabled = true;
    try { const r = await api("/api/sales?as=admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ do: "reps", reps: list }) }); SA.reps = r.reps; toast("Accounts saved."); salesLoad(); }
    catch (err) {
      $("sasave").disabled = false; if (err.status === 401) return;
      const m = { bad_rep: "Each account needs a name and a full phone number.", bad_pin: "A PIN is 4 to 8 digits.", pin_needed: "A new account needs a PIN.", same_phone: "Two accounts have the same phone number." }[err.message];
      $("samsg").textContent = (m || "Could not save. Try again.") + (err.body && err.body.detail ? ` (${err.body.detail})` : "");
    }
  };
}

let SALF = null;
const saLeaflet = () => SALF || (SALF = new Promise((ok, no) => { const c = document.createElement("link"); c.rel = "stylesheet"; c.href = "/vendor/leaflet/leaflet.css"; document.head.appendChild(c); const s = document.createElement("script"); s.src = "/vendor/leaflet/leaflet.js"; s.onload = ok; s.onerror = () => { SALF = null; no(); }; document.head.appendChild(s); }));
function saMap(cl, vt) {
  saLeaflet().then(() => {
    const box = $("sa-map"); if (!box) return;
    if (SAMAP) { SAMAP.remove(); SAMAP = null; }
    SAMAP = L.map(box).setView([33.89, 35.5], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(SAMAP);
    const pts = [], name = (id) => (SA.reps.find((r) => r.id === id) || { n: "" }).n;
    const dot = (col, sz) => L.divIcon({ className: "", html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
    cl.filter((c) => c.lat !== null && c.lng !== null && c.stg !== "lost").forEach((c) => { pts.push([c.lat, c.lng]); L.marker([c.lat, c.lng], { icon: dot(c.st === "lead" ? "#e8590c" : "#0573c4", 14), title: c.n }).bindPopup(`<b>${esc(c.n)}</b><br>${c.st === "lead" ? "Lead · " + SA_STAGE[c.stg] : "Client"}<br>Rep: ${esc(name(c.rep))}`).addTo(SAMAP); });
    vt.forEach((v) => { pts.push([v.lat, v.lng]); L.marker([v.lat, v.lng], { icon: dot("#1a8f4a", 18), zIndexOffset: 500 }).bindPopup(`<b>${esc(name(v.rep))}</b><br>Checked in ${saWhen(v.in)}`).addTo(SAMAP); });
    if (pts.length) SAMAP.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
  }).catch(() => {});
}
