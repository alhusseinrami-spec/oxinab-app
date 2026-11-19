/* Oxinab Sales: the sales rep's app. Clients and leads, check-in and check-out at visits, offers that become
   a numbered proforma PDF or an order, follow-up reminders, the month's target, and a map with a visit route.
   What each account can use is switched on or off in the Command Center (Sales team tab).
   The proforma PDF is drawn by proforma.js (pfPdf, pfSums, money2), the same as in the Command Center. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const toast = (m) => { const o = document.createElement("div"); o.className = "toast"; o.setAttribute("role", "status"); o.textContent = m; document.body.appendChild(o); setTimeout(() => o.remove(), 3800); };
const usd = (v) => "$" + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (v) => "$" + Math.round(Number(v || 0)).toLocaleString("en-US");
const TZ = "Asia/Beirut";
const dayOf = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in Lebanon
const today = () => dayOf(Date.now());
const addDays = (n) => dayOf(Date.now() + n * 864e5);
const hm = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dshort = (iso) => new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const dlong = (ymd) => new Date(ymd + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const daysFrom = (ymd) => Math.round((Date.parse(ymd + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
const intl = (p) => { let d = String(p || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, ""); if (!d.startsWith("961")) d = "961" + d.replace(/^0/, ""); return d; };
const KIND = { pharmacy: ["Pharmacy", "💊"], hospital: ["Hospital", "🏥"], clinic: ["Clinic", "🩺"], doctor: ["Doctor", "👨‍⚕️"], lab: ["Lab", "🧪"], ngo: ["NGO", "🤝"], company: ["Company", "🏢"], other: ["Other", "📍"] };
const STAGE = { new: "New", contacted: "Contacted", interested: "Interested", offer: "Offer given", won: "Won", lost: "Lost" };
const RES = { order: "Order placed", offer: "Offer given", followup: "Follow-up needed", nointerest: "Not interested", other: "Other" };
const OST = { open: "Open", sent: "Sent", won: "Won", lost: "Lost" };

let ME = null, DOC = null, CAT = null, VIEW = "today", POS = null, busy = false;
const F = { cq: "", ck: "all", cs: "az", lq: "", ls: "all", os: "open", mf: "all" };
const can = (k) => !!(ME && ME.f && ME.f[k]);

async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opt });
  let b = {}; try { b = await r.json(); } catch (e) {}
  if (r.status === 401 && path !== "/api/admin/login") { showLogin(); }
  if (!r.ok) throw Object.assign(new Error(b.error || "error"), { status: r.status, body: b });
  return b;
}
const post = (body) => api("/api/sales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ERR = {
  name_needed: "Give the client a name.", no_lines: "Add at least one product.", client_needed: "Choose the client first.", open_visit: "You are still checked in somewhere. Check out first.",
  needs_approval: "This offer is waiting for approval in the Command Center.", already_ordered: "This offer was already ordered.", has_orders: "This client has orders, so it can't be deleted.",
  in_use: "This offer has a proforma or an order, so it can't be deleted.", not_allowed: "This is switched off for your account.", location_needed: "Your location is needed to check in. Allow location for this site and try again.",
};
const fail = (e, def = "Could not save. Check your connection and try again.") => { if (e.status === 401) return; toast(ERR[e.message] || def); };

/* ---------- Loading ---------- */
function showLogin() { ME = null; $("login").hidden = false; $("tabs").hidden = true; $("out").hidden = true; $("who").textContent = ""; document.querySelectorAll("main>section[id^=v-]").forEach((s) => (s.hidden = true)); closeAll(); }
async function load() {
  try {
    const r = await api("/api/sales");
    ME = r.me; DOC = r.doc;
    $("login").hidden = true; $("tabs").hidden = false; $("out").hidden = false; $("who").textContent = ME.n;
    document.querySelectorAll("#tabs [data-f]").forEach((b) => (b.hidden = !can(b.dataset.f)));
    if (document.querySelector(`#tabs [data-v="${VIEW}"]`).hidden) VIEW = "today";
    if (!CAT) loadCat();
    show(VIEW);
  } catch (e) { if (e.status !== 401) { $("login").hidden = true; $("v-today").hidden = false; $("v-today").innerHTML = `<div class="empty"><span>📶</span>No connection. Pull down or try again in a moment.<br><button class="big lite" onclick="load()">Try again</button></div>`; } }
}
async function loadCat() { try { CAT = await api("/api/catalog"); } catch (e) { CAT = null; } }
const catItem = (id) => CAT && CAT.items.find((i) => i.id === id);
const netP = (it) => Math.round((it.p || 0) * (1 - (it.dc || 0) / 100) * 100) / 100;
const client = (id) => DOC.cl.find((c) => c.id === id);
const openVisit = () => DOC.vs.find((v) => !v.out);
const lineDisc = (l, lp) => (lp > 0 && l.p < lp ? Math.round((1 - l.p / lp) * 1000) / 10 : 0); // % off the list price
const dec = (v) => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; }; // accepts 5,51 and 5.51
const DEC = 'type="text" inputmode="decimal" autocomplete="off"';
const sellAt = (l) => { const it = catItem(l.id); return +l.lp > 0 ? +l.lp : it ? it.p || 0 : 0; }; // selling price on the line, the catalogue one unless changed
const freeOf = (l) => (l.fq || 0) + (l.fr || 0);
// A line gets a discount or free goods, never both. Lines saved before this rule: free goods win if there are any.
const lineMode = (l) => (l.m === "f" || l.m === "d" ? l.m : +l.fr > 0 || +l.fq > 0 ? "f" : "d");
const offerTotal = (o) => { const sub = o.lines.reduce((s, l) => s + l.q * l.p, 0), b = sub - Math.min(o.disc || 0, sub) + (o.ship || 0); return b + b * (o.vat || 0) / 100; };
const setDoc = (d) => { if (d) DOC = d; };

function show(v) {
  VIEW = v;
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.v === v ? "true" : "false"));
  ["today", "clients", "leads", "offers", "map"].forEach((x) => ($("v-" + x).hidden = x !== v));
  ({ today: drawToday, clients: () => drawList("client"), leads: () => drawList("lead"), offers: drawOffers, map: drawMap })[v]();
  badges();
}
function redraw() { if (ME) { show(VIEW); if (STACK.length) STACK[STACK.length - 1].draw(); } }
function badges() {
  const due = DOC.cl.filter((c) => c.nx && c.nx <= today()).length;
  const t = document.querySelector('#tabs [data-v="today"]'); let i = t.querySelector("i");
  if (due) { if (!i) { i = document.createElement("i"); t.appendChild(i); } i.textContent = due; } else if (i) i.remove();
}
$("tabs").onclick = (e) => { const b = e.target.closest("button[data-v]"); if (b) { closeAll(); show(b.dataset.v); window.scrollTo(0, 0); } };

/* ---------- Location ---------- */
function getPos(timeout = 12000) {
  return new Promise((ok) => {
    if (!("geolocation" in navigator)) return ok(null);
    navigator.geolocation.getCurrentPosition((p) => { POS = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() }; ok(POS); },
      () => ok(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}
const metres = (a, b) => { const R = 6371e3, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const dist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km");
const hasLoc = (c) => c.lat !== null && c.lat !== undefined && c.lng !== null && c.lng !== undefined;
const mapsUrl = (c) => hasLoc(c) ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.n, c.addr, c.area, "Lebanon"].filter(Boolean).join(", "))}`;

/* ---------- Today ---------- */
function monthStats() {
  const m = today().slice(0, 7), od = DOC.od.filter((o) => dayOf(o.at).slice(0, 7) === m);
  return { sales: od.reduce((s, o) => s + (o.total || 0), 0), orders: od.length, visits: DOC.vs.filter((v) => dayOf(v.in).slice(0, 7) === m).length };
}
function drawToday() {
  const el = $("v-today"), t = today(), ms = monthStats(), ov = openVisit();
  const due = DOC.cl.filter((c) => c.nx && c.nx <= t).sort((a, b) => (a.nx < b.nx ? -1 : 1));
  const soon = DOC.cl.filter((c) => c.nx && c.nx > t && c.nx <= addDays(7)).sort((a, b) => (a.nx < b.nx ? -1 : 1));
  const vt = DOC.vs.filter((v) => dayOf(v.in) === t).reverse();
  const wait = DOC.of.filter((o) => o.ap === "wait").length, back = DOC.of.filter((o) => o.ap === "ok" && !o.pf && !o.ord && o.st === "open").length;
  const now = new Date(), last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), left = last - now.getDate();
  let tg = "";
  if (can("target")) {
    const pc = ME.tgt ? Math.min(100, Math.round((ms.sales / ME.tgt) * 100)) : 0;
    tg = `<div class="card tgt"><div class="k"><span>Sales this month</span>${ME.tgt ? `<span>${pc}%</span>` : ""}</div><div class="k"><b class="num">${usd0(ms.sales)}</b>${ME.tgt ? `<span class="num">of ${usd0(ME.tgt)}</span>` : ""}</div>
${ME.tgt ? `<div class="bar"><i style="width:${pc}%"></i></div><div class="sm" style="opacity:.85">${ms.sales >= ME.tgt ? "Target reached. Well done! 🎉" : `${usd0(ME.tgt - ms.sales)} to go · ${left} day${left === 1 ? "" : "s"} left`}</div>` : `<div class="sm" style="opacity:.85;margin-top:6px">No monthly target set.</div>`}</div>`;
  }
  el.innerHTML = `${ov ? visitCard(ov) : ""}${tg}
<div class="stats"><div><b class="num">${vt.length}</b><span>Visits today</span></div><div><b class="num">${ms.orders}</b><span>Orders this month</span></div><div><b class="num">${DOC.of.filter((o) => o.st === "open" || o.st === "sent").length}</b><span>Open offers</span></div></div>
${wait ? `<div class="warnbox">⏳ ${wait} offer${wait > 1 ? "s are" : " is"} waiting for discount approval.</div>` : ""}${back ? `<div class="okbox">✓ ${back} offer${back > 1 ? "s were" : " was"} approved. <a href="#" data-go="offers">Open offers</a></div>` : ""}
<div class="quick" style="margin-top:12px"><button data-new="client"><span>➕</span>New client</button>${can("leads") ? `<button data-new="lead"><span>🎯</span>New lead</button>` : ""}${can("offers") ? `<button data-new="offer"><span>📄</span>New offer</button>` : ""}</div>
<div class="h2"><h2>Follow-ups due${due.length ? ` (${due.length})` : ""}</h2>${due.length && can("map") ? `<button class="btn" data-route>🧭 Plan route</button>` : ""}</div>
${due.length ? due.map((c) => row(c, fuText(c))).join("") : `<div class="card mu sm">Nothing due. Set a follow-up date on a client and it shows here on the day.</div>`}
${soon.length ? `<div class="h2"><h2>Next 7 days</h2></div>${soon.map((c) => row(c, fuText(c))).join("")}` : ""}
<div class="h2"><h2>Today's visits</h2></div>
${vt.length ? vt.map((v) => { const c = client(v.cl) || { n: "Client removed", k: "other", st: "client" }; return row(c, `${hm(v.in)}${v.out ? "–" + hm(v.out) : " · now"}${v.res ? " · " + RES[v.res] : ""}`); }).join("") : `<div class="card mu sm">No visits yet today.${can("checkin") ? " Open a client and tap Check in when you arrive." : ""}</div>`}`;
}
const fuText = (c) => { const d = daysFrom(c.nx); return `<span class="${d < 0 ? "due" : ""}">${d < 0 ? `Overdue ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : dlong(c.nx)}</span>${c.nxn ? " · " + esc(c.nxn) : ""}`; };
function visitCard(v) {
  const c = client(v.cl) || { n: "Client" };
  return `<div class="card visit"><h3>📍 Checked in at ${esc(c.n)}</h3><p class="sm" style="margin:2px 0 0">Since ${hm(v.in)}${v.d !== null && v.d !== undefined ? ` · ${v.d > 300 ? "⚠ " : ""}${dist(v.d)} from the saved place` : ""}</p>
<div class="row" style="margin-top:8px"><button class="btn pri" data-checkout="${v.id}">Check out</button><button class="btn" data-open="${c.id}">Open client</button>${can("offers") ? `<button class="btn" data-newoffer="${c.id}">New offer</button>` : ""}</div></div>`;
}
function row(c, sub, end = "") {
  const k = KIND[c.k] || KIND.other;
  return `<button class="li" data-open="${esc(c.id)}"><span class="av${c.st === "lead" ? " lead" : ""}" aria-hidden="true">${k[1]}</span><span class="tx"><b>${esc(c.n)}${c.co ? ` <span class="mu" style="display:inline;font-weight:400">· ${esc(c.co)}</span>` : ""}</b><span>${sub}</span></span>${end ? `<span class="end">${end}</span>` : ""}</button>`;
}

/* ---------- Clients and leads lists ---------- */
function drawList(st) {
  const el = $(st === "lead" ? "v-leads" : "v-clients"), L = st === "lead";
  const all = DOC.cl.filter((c) => c.st === st), q = (L ? F.lq : F.cq).trim().toLowerCase();
  let it = all.filter((c) => (!q || [c.n, c.co, c.tel, c.addr, c.area, c.note].join(" ").toLowerCase().includes(q)));
  if (L) it = it.filter((c) => F.ls === "all" ? c.stg !== "lost" : c.stg === F.ls); else it = it.filter((c) => F.ck === "all" || c.k === F.ck);
  const sort = L ? "az" : F.cs;
  if (sort === "near" && POS) it.sort((a, b) => (hasLoc(a) ? metres(POS, a) : 9e9) - (hasLoc(b) ? metres(POS, b) : 9e9));
  else if (sort === "fu") it.sort((a, b) => (a.nx || "9") < (b.nx || "9") ? -1 : 1);
  else it.sort((a, b) => a.n.localeCompare(b.n));
  const chips = L
    ? `<div class="chips" data-chip="ls"><button data-val="all" aria-pressed="${F.ls === "all"}">Open (${all.filter((c) => c.stg !== "lost").length})</button>${Object.keys(STAGE).filter((s) => s !== "won").map((s) => `<button data-val="${s}" aria-pressed="${F.ls === s}">${STAGE[s]} (${all.filter((c) => c.stg === s).length})</button>`).join("")}</div>`
    : `<div class="chips" data-chip="ck"><button data-val="all" aria-pressed="${F.ck === "all"}">All (${all.length})</button>${Object.keys(KIND).filter((k) => all.some((c) => c.k === k)).map((k) => `<button data-val="${k}" aria-pressed="${F.ck === k}">${KIND[k][1]} ${KIND[k][0]}</button>`).join("")}</div>
<div class="chips" data-chip="cs"><button data-val="az" aria-pressed="${F.cs === "az"}">A–Z</button><button data-val="near" aria-pressed="${F.cs === "near"}">📍 Nearest</button><button data-val="fu" aria-pressed="${F.cs === "fu"}">Follow-up date</button></div>`;
  el.innerHTML = `<div class="search"><div class="row"><input type="search" data-q="${L ? "lq" : "cq"}" placeholder="Search name, phone, area…" value="${esc(L ? F.lq : F.cq)}" aria-label="Search" style="flex:1"><button class="btn pri" data-new="${st}">+ Add</button></div></div>${chips}
${it.length ? it.map((c) => row(c, L ? `${STAGE[c.stg]}${c.area ? " · " + esc(c.area) : ""}${c.nx ? " · " + fuText(c) : ""}` : `${KIND[c.k] ? KIND[c.k][0] : ""}${c.area ? " · " + esc(c.area) : ""}${c.nx ? " · " + fuText(c) : ""}`,
    sort === "near" && POS && hasLoc(c) ? dist(metres(POS, c)) : L ? `<span class="pill lead">${STAGE[c.stg]}</span>` : "")).join("")
    : `<div class="empty"><span>${L ? "🎯" : "🏥"}</span>${all.length ? "Nothing matches." : L ? "No leads yet. Add places you want to win as clients." : "No clients yet. Add your first one."}</div>`}`;
}
document.addEventListener("input", (e) => { const q = e.target.dataset && e.target.dataset.q; if (!q) return; F[q] = e.target.value; const pos = e.target.selectionStart; drawList(q === "lq" ? "lead" : "client"); const n = document.querySelector(`[data-q="${q}"]`); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} });
document.addEventListener("click", async (e) => {
  const ch = e.target.closest("[data-chip] button"); if (ch) {
    const k = ch.closest("[data-chip]").dataset.chip; F[k] = ch.dataset.val;
    if (k === "cs" && F.cs === "near" && !POS) { toast("Finding your location…"); if (!(await getPos())) { toast("Allow location for this site to sort by distance."); F.cs = "az"; } }
    if (k === "mf") { drawMapPins(); document.querySelectorAll('[data-chip="mf"] button').forEach((b) => b.setAttribute("aria-pressed", b.dataset.val === F.mf)); return; }
    redraw(); return;
  }
  const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); closeAll(); show(g.dataset.go); return; }
  const o = e.target.closest("[data-open]"); if (o) { openClient(o.dataset.open); return; }
  const n = e.target.closest("[data-new]"); if (n) { if (n.dataset.new === "offer") editOffer(null, ""); else editClient(null, n.dataset.new); return; }
  const no = e.target.closest("[data-newoffer]"); if (no) { editOffer(null, no.dataset.newoffer); return; }
  const ci = e.target.closest("[data-checkin]"); if (ci) { checkIn(ci.dataset.checkin, ci); return; }
  const co = e.target.closest("[data-checkout]"); if (co) { checkOut(co.dataset.checkout); return; }
  const of = e.target.closest("[data-offer]"); if (of) { openOffer(of.dataset.offer); return; }
  if (e.target.closest("[data-route]")) { closeAll(); show("map"); planRoute(true); }
});

/* ---------- Sheets (full-screen pages over the tabs) ---------- */
const STACK = [];
function sheet(title, draw, right = "") {
  const m = document.createElement("div"); m.className = "sheet"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", title);
  m.innerHTML = `<div class="sh"><button data-back aria-label="Back">‹ Back</button><h2>${esc(title)}</h2>${right}</div><div class="in"></div>`;
  document.body.appendChild(m); document.body.style.overflow = "hidden";
  const s = { m, body: m.querySelector(".in"), draw: () => draw(s), title: (t) => (m.querySelector("h2").textContent = t) };
  m.querySelector("[data-back]").onclick = () => closeSheet();
  STACK.push(s); s.draw(); return s;
}
function closeSheet() { const s = STACK.pop(); if (s) s.m.remove(); if (!STACK.length) document.body.style.overflow = ""; else STACK[STACK.length - 1].draw(); if (ME) show(VIEW); }
function closeAll() { while (STACK.length) STACK.pop().m.remove(); document.body.style.overflow = ""; }
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && STACK.length) closeSheet(); });

/* ---------- One client ---------- */
function openClient(id) {
  sheet("Client", (s) => {
    const c = client(id); if (!c) { s.body.innerHTML = '<div class="empty">This client was removed.</div>'; return; }
    s.title(c.n);
    const k = KIND[c.k] || KIND.other, ov = openVisit(), here = ov && ov.cl === c.id;
    const ods = DOC.od.filter((o) => o.cl === c.id).reverse(), ofs = DOC.of.filter((o) => o.cl === c.id).reverse(), vs = DOC.vs.filter((v) => v.cl === c.id).reverse();
    const spent = ods.reduce((a, o) => a + (o.total || 0), 0);
    s.body.innerHTML = `<div class="card"><div class="row"><span class="pill">${k[1]} ${k[0]}</span>${c.st === "lead" ? `<span class="pill lead">Lead · ${STAGE[c.stg]}</span>` : `<span class="pill ok">Client</span>`}${c.dc ? `<span class="pill warn">${c.dc}% discount</span>` : ""}<span class="sp"></span><button class="btn" data-edit>Edit</button></div>
<dl class="kv" style="margin:12px 0 0">${c.co ? `<dt>Company</dt><dd>${esc(c.co)}</dd>` : ""}${c.tel ? `<dt>Phone</dt><dd dir="ltr" style="text-align:start">${esc(c.tel)}</dd>` : ""}${c.em ? `<dt>Email</dt><dd>${esc(c.em)}</dd>` : ""}${c.addr || c.area ? `<dt>Address</dt><dd>${esc([c.addr, c.area].filter(Boolean).join(", "))}</dd>` : ""}<dt>Location</dt><dd>${hasLoc(c) ? `Saved${POS ? " · " + dist(metres(POS, c)) + " from you" : ""}` : `<span class="mu">Not saved yet${can("checkin") ? ". It's saved at the first check-in." : ""}</span>`}</dd>${c.src ? `<dt>Source</dt><dd>${esc(c.src)}</dd>` : ""}${c.note ? `<dt>Notes</dt><dd>${esc(c.note).replace(/\n/g, "<br>")}</dd>` : ""}</dl>
<div class="acts">${c.tel ? `<a href="tel:+${esc(intl(c.tel))}"><span>📞</span>Call</a><a href="https://wa.me/${esc(intl(c.tel))}" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a>` : ""}<a href="${mapsUrl(c)}" target="_blank" rel="noopener"><span>🧭</span>Directions</a>${CAT ? `<a href="/" target="_blank" rel="noopener"><span>🛒</span>Catalogue</a>` : ""}</div>
${can("checkin") ? (here ? `<button class="big ok" data-checkout="${ov.id}">✓ Check out (here since ${hm(ov.in)})</button>` : `<button class="big go" data-checkin="${c.id}"${ov ? " disabled" : ""}>📍 Check in here</button>${ov ? `<p class="mu sm" style="margin:6px 0 0">You are checked in at ${esc((client(ov.cl) || {}).n || "another client")}. Check out there first.</p>` : ""}`) : ""}
${can("offers") ? `<button class="big" data-newoffer="${c.id}">📄 New offer${can("proforma") ? " / proforma" : ""}${can("orders") ? " / order" : ""}</button>` : ""}
${c.st === "lead" ? `<div class="row" style="margin-top:12px"><label style="margin:0;flex:1">Stage<select data-stage>${Object.keys(STAGE).map((x) => `<option value="${x}" ${x === c.stg ? "selected" : ""}>${STAGE[x]}</option>`).join("")}</select></label></div><button class="big lite" data-convert>✓ Turn into a client</button>` : ""}</div>
<div class="card"><h3 style="font-size:16px">Follow-up</h3><div class="g2"><label>Date<input type="date" data-nx value="${esc(c.nx)}"></label><label>What for<input data-nxn value="${esc(c.nxn)}" maxlength="200" placeholder="e.g. bring samples"></label></div>
<div class="row" style="margin-top:8px"><button class="btn" data-fu="7">In 1 week</button><button class="btn" data-fu="14">2 weeks</button><button class="btn" data-fu="30">1 month</button>${c.nx ? `<button class="btn dng" data-fu="0">Clear</button>` : ""}</div></div>
<div class="h2"><h2>History</h2>${spent ? `<span class="mu sm">${usd0(spent)} ordered</span>` : ""}</div>
${[...ods.map((o) => ({ t: o.at, h: `🧾 <b>Order #${esc(o.id)}</b> · ${usd(o.total)}` })), ...ofs.map((o) => ({ t: o.at, h: `📄 <a href="#" data-offer="${o.id}"><b>Offer</b></a> · ${usd(offerTotal(o))} · ${OST[o.st]}${o.pf ? " · " + esc(o.pf) : ""}` })), ...vs.map((v) => ({ t: v.in, h: `📍 <b>Visit</b> ${hm(v.in)}${v.out ? "–" + hm(v.out) : ""}${v.res ? " · " + RES[v.res] : ""}${v.note ? `<br><span class="mu sm">${esc(v.note)}</span>` : ""}` }))]
    .sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 40).map((x) => `<div class="hist"><span class="mu sm">${dshort(x.t)}</span><br>${x.h}</div>`).join("") || `<p class="mu sm">No visits, offers or orders yet.</p>`}`;
    const B = s.body;
    B.querySelector("[data-edit]").onclick = () => editClient(c.id, c.st);
    const saveFu = async (nx, nxn) => { try { setDoc((await post({ do: "client", client: { ...c, nx, nxn } })).doc); toast(nx ? `Follow-up set for ${dlong(nx)}.` : "Follow-up cleared."); s.draw(); } catch (e) { fail(e); } };
    B.querySelectorAll("[data-fu]").forEach((b) => (b.onclick = () => saveFu(+b.dataset.fu ? addDays(+b.dataset.fu) : "", +b.dataset.fu ? B.querySelector("[data-nxn]").value : "")));
    B.querySelector("[data-nx]").onchange = (e) => saveFu(e.target.value, B.querySelector("[data-nxn]").value);
    B.querySelector("[data-nxn]").onchange = (e) => { if (c.nx) saveFu(c.nx, e.target.value); };
    const sg = B.querySelector("[data-stage]"); if (sg) sg.onchange = async () => { try { setDoc((await post({ do: "client", client: { ...c, stg: sg.value } })).doc); toast("Stage: " + STAGE[sg.value]); s.draw(); } catch (e) { fail(e); } };
    const cv = B.querySelector("[data-convert]"); if (cv) cv.onclick = async () => { try { setDoc((await post({ do: "client", client: { ...c, st: "client" } })).doc); toast(`${c.n} is a client now.`); s.draw(); } catch (e) { fail(e); } };
  });
}

/* ---------- Add or edit a client or lead ---------- */
function editClient(id, st) {
  const old = id ? client(id) : null;
  const c = old ? { ...old } : { st: st || "client", stg: "new", n: "", co: "", k: "pharmacy", tel: "", em: "", addr: "", area: "", lat: null, lng: null, dc: 0, note: "", nx: "", nxn: "", src: "" };
  sheet(old ? "Edit " + (c.st === "lead" ? "lead" : "client") : c.st === "lead" ? "New lead" : "New client", (s) => {
    s.body.innerHTML = `<form class="card" novalidate>
<label>Name *<input name="n" value="${esc(c.n)}" maxlength="80" required placeholder="Pharmacy, hospital or person"></label>
<label>Company / contact person<input name="co" value="${esc(c.co)}" maxlength="80"></label>
<div class="g2"><label>Type<select name="k">${Object.keys(KIND).map((k) => `<option value="${k}" ${k === c.k ? "selected" : ""}>${KIND[k][1]} ${KIND[k][0]}</option>`).join("")}</select></label>
${c.st === "lead" ? `<label>Stage<select name="stg">${Object.keys(STAGE).map((x) => `<option value="${x}" ${x === c.stg ? "selected" : ""}>${STAGE[x]}</option>`).join("")}</select></label>` : `<label>Standing discount %<input name="dc" ${DEC} value="${c.dc || ""}" placeholder="0"></label>`}</div>
<div class="g2"><label>Phone<input name="tel" type="tel" value="${esc(c.tel)}" maxlength="30" dir="ltr"></label><label>Email<input name="em" type="email" value="${esc(c.em)}" maxlength="80"></label></div>
<label>Address<input name="addr" value="${esc(c.addr)}" maxlength="200" placeholder="Street, building, floor"></label>
<label>Area / town<input name="area" value="${esc(c.area)}" maxlength="60" placeholder="e.g. Hamra, Jounieh, Saida"></label>
${c.st === "lead" ? `<label>Where did this lead come from?<input name="src" value="${esc(c.src)}" maxlength="60" placeholder="Referral, walk-in, exhibition…"></label>` : ""}
<label>Location</label><div class="row"><span class="sm ${hasLoc(c) ? "" : "mu"}" data-loc style="flex:1">${hasLoc(c) ? `Saved (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})` : "Not saved"}</span><button type="button" class="btn" data-here>📍 I'm here now</button>${hasLoc(c) ? `<button type="button" class="btn dng" data-noloc>Clear</button>` : ""}</div>
<label>Notes<textarea name="note" rows="3" maxlength="600" placeholder="Opening hours, who decides, what they buy…">${esc(c.note)}</textarea></label>
<button class="big" type="submit">${old ? "Save changes" : "Add " + (c.st === "lead" ? "lead" : "client")}</button><p class="err" data-err role="alert"></p>
${old && can("remove") ? `<button type="button" class="big lite" data-del style="color:var(--bad)">Delete</button>` : ""}</form>`;
    const f = s.body.querySelector("form");
    f.oninput = (e) => { if (e.target.name) c[e.target.name] = e.target.value; };
    f.querySelector("[data-here]").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "Finding you…";
      const p = await getPos(15000);
      if (!p) { toast("Could not get your location. Allow location for this site."); s.draw(); return; }
      c.lat = p.lat; c.lng = p.lng; toast(`Location saved (within ${p.acc} m). Tap Save to keep it.`); s.draw();
    };
    const nl0 = f.querySelector("[data-noloc]"); if (nl0) nl0.onclick = () => { c.lat = null; c.lng = null; s.draw(); };
    const del = f.querySelector("[data-del]"); if (del) del.onclick = async () => {
      if (!confirm(`Delete ${c.n}? Its visits and offers stay in your history.`)) return;
      try { setDoc((await post({ do: "delclient", id: c.id })).doc); toast("Deleted."); closeAll(); show(VIEW); } catch (e) { fail(e, "Could not delete."); }
    };
    f.onsubmit = async (e) => {
      e.preventDefault(); if (busy) return;
      if (!c.n.trim()) { f.querySelector("[data-err]").textContent = "Give it a name."; return; }
      busy = true; const b = f.querySelector("button[type=submit]"); b.disabled = true;
      try { const r = await post({ do: "client", client: c }); setDoc(r.doc); closeSheet(); if (!old) openClient(r.client.id); toast(old ? "Saved." : `${r.client.n} added.`); }
      catch (err) { b.disabled = false; f.querySelector("[data-err]").textContent = ERR[err.message] || "Could not save. Check your connection and try again."; }
      busy = false;
    };
  });
}

/* ---------- Check in and check out ---------- */
async function checkIn(id, btn) {
  if (busy) return; busy = true;
  if (btn) { btn.disabled = true; btn.textContent = "Finding your location…"; }
  const p = await getPos(15000);
  if (!p && can("gps")) { busy = false; toast(ERR.location_needed); redraw(); return; }
  try {
    const r = await post({ do: "checkin", cl: id, ...(p ? { lat: p.lat, lng: p.lng, acc: p.acc } : {}) });
    setDoc(r.doc);
    const v = r.visit;
    toast(r.saved ? "Checked in. This place is now saved as the client's location." : v.d === null ? (p ? "Checked in." : "Checked in without location.") : v.d > 300 ? `Checked in, but you are ${dist(v.d)} from the client's saved place.` : `Checked in (${dist(v.d)} from the saved place).`);
  } catch (e) { fail(e, "Could not check in. Try again."); }
  busy = false; redraw();
}
function checkOut(vid) {
  const v = DOC.vs.find((x) => x.id === vid); if (!v) return;
  const c = client(v.cl) || {};
  const S = { res: "", note: "", nx: c.nx || "", nxn: c.nxn || "", stg: c.stg };
  sheet("Check out", (s) => {
    s.body.innerHTML = `<div class="card"><h3 style="font-size:17px">${esc(c.n || "Visit")}</h3><p class="mu sm" style="margin:2px 0 0">Here since ${hm(v.in)} (${Math.max(1, Math.round((Date.now() - Date.parse(v.in)) / 60000))} min)</p>
<label>How did it go?</label><div class="chips" style="flex-wrap:wrap" data-res>${Object.keys(RES).map((k) => `<button type="button" data-val="${k}" aria-pressed="${S.res === k}">${RES[k]}</button>`).join("")}</div>
<label>Notes from the visit<textarea data-note rows="3" maxlength="600" placeholder="What they need, prices they mentioned, who you met…">${esc(S.note)}</textarea></label>
${c.st === "lead" ? `<label>Lead stage<select data-stg>${Object.keys(STAGE).map((x) => `<option value="${x}" ${x === S.stg ? "selected" : ""}>${STAGE[x]}</option>`).join("")}</select></label>` : ""}
<div class="g2"><label>Next follow-up<input type="date" data-nx value="${esc(S.nx)}"></label><label>What for<input data-nxn value="${esc(S.nxn)}" maxlength="200"></label></div>
<div class="row" style="margin-top:8px"><button class="btn" data-fu="3">In 3 days</button><button class="btn" data-fu="7">1 week</button><button class="btn" data-fu="30">1 month</button><button class="btn" data-fu="0">None</button></div>
<button class="big ok" data-save>✓ Check out</button></div>`;
    const B = s.body;
    B.querySelector("[data-res]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; S.res = b.dataset.val; if (S.res === "followup" && !S.nx) S.nx = addDays(7); if (S.res === "nointerest" && c.st === "lead") S.stg = "lost"; if (S.res === "offer" && c.st === "lead") S.stg = "offer"; S.note = B.querySelector("[data-note]").value; s.draw(); };
    B.querySelector("[data-note]").oninput = (e) => (S.note = e.target.value);
    B.querySelector("[data-nx]").onchange = (e) => (S.nx = e.target.value);
    B.querySelector("[data-nxn]").oninput = (e) => (S.nxn = e.target.value);
    const sg = B.querySelector("[data-stg]"); if (sg) sg.onchange = () => (S.stg = sg.value);
    B.querySelectorAll("[data-fu]").forEach((b) => (b.onclick = () => { S.nx = +b.dataset.fu ? addDays(+b.dataset.fu) : ""; S.note = B.querySelector("[data-note]").value; s.draw(); }));
    B.querySelector("[data-save]").onclick = async (e) => {
      if (!S.res) { toast("Choose how the visit went."); return; }
      e.target.disabled = true;
      try { setDoc((await post({ do: "checkout", id: v.id, res: S.res, note: S.note, nx: S.nx, nxn: S.nxn, stg: c.st === "lead" ? S.stg : undefined })).doc); closeSheet(); toast("Checked out." + (S.nx ? ` Follow-up ${dlong(S.nx)}.` : "")); }
      catch (err) { e.target.disabled = false; fail(err); }
    };
  });
}

/* ---------- Offers list ---------- */
function drawOffers() {
  const el = $("v-offers"), all = DOC.of.slice().reverse();
  const flt = { open: (o) => o.st === "open" || o.st === "sent", wait: (o) => o.ap === "wait", won: (o) => o.st === "won", lost: (o) => o.st === "lost", all: () => true };
  const it = all.filter(flt[F.os]);
  const val = it.reduce((s, o) => s + offerTotal(o), 0);
  el.innerHTML = `<div class="row" style="margin:6px 0"><h2 style="font-size:18px;flex:1">Offers</h2><button class="btn pri" data-new="offer">+ New offer</button></div>
<div class="chips" data-chip="os">${[["open", "Open"], ["wait", "Waiting approval"], ["won", "Won"], ["lost", "Lost"], ["all", "All"]].map(([k, t]) => `<button data-val="${k}" aria-pressed="${F.os === k}">${t} (${all.filter(flt[k]).length})</button>`).join("")}</div>
${it.length ? `<p class="mu sm" style="margin:2px 0">${it.length} offer${it.length > 1 ? "s" : ""} · ${usd0(val)}</p>` + it.map(offerRow).join("") : `<div class="empty"><span>📄</span>No offers here. Open a client and tap New offer.</div>`}`;
}
function offerRow(o) {
  const c = client(o.cl) || { n: "Client removed" };
  return `<button class="li" data-offer="${o.id}"><span class="av" aria-hidden="true">📄</span><span class="tx"><b>${esc(c.n)}</b><span>${dshort(o.up || o.at)} · ${o.lines.length} item${o.lines.length > 1 ? "s" : ""}${o.pf ? " · " + esc(o.pf) : ""}${o.ord ? " · order #" + esc(o.ord) : ""}</span></span><span class="end"><b class="num">${usd(offerTotal(o))}</b><br>${apPill(o) || `<span class="pill ${o.st === "won" ? "ok" : o.st === "lost" ? "bad" : ""}">${OST[o.st]}</span>`}</span></button>`;
}
const apPill = (o) => (o.ap === "wait" ? '<span class="pill warn">Waiting approval</span>' : o.ap === "no" ? '<span class="pill bad">Not approved</span>' : "");

/* ---------- Offer editor ---------- */
function editOffer(id, clId) {
  const old = id ? DOC.of.find((o) => o.id === id) : null;
  const O = old ? JSON.parse(JSON.stringify(old)) : { cl: clId || "", lines: [], disc: 0, ship: 0, vat: 0, valid: 7, note: "" };
  let q = "", cq = "";
  const cdc = () => (client(O.cl) || {}).dc || 0;
  const std = (it) => Math.round(netP(it) * (1 - cdc() / 100) * 100) / 100;
  // Discount OR free goods on a line. "f": free goods at the selling price; "d": the discount, no free goods.
  const setMode = (l, m) => {
    const it = catItem(l.id), lp = sellAt(l);
    l.m = m;
    if (m === "f") l.p = lp;
    else { l.fr = 0; l.p = it && it.p ? Math.round(lp * (std(it) / it.p) * 100) / 100 : l.p; }
  };
  if (!CAT) loadCat().then(() => STACK.length && STACK[STACK.length - 1].draw());
  sheet(old ? "Edit offer" : "New offer", (s) => {
    const c = client(O.cl);
    if (!c) {
      const L = DOC.cl.filter((x) => !cq || [x.n, x.co, x.area].join(" ").toLowerCase().includes(cq.toLowerCase())).sort((a, b) => a.n.localeCompare(b.n));
      s.body.innerHTML = `<div class="card"><h3 style="font-size:16px">Who is the offer for?</h3><input type="search" data-cq placeholder="Search clients and leads" value="${esc(cq)}" style="margin-top:8px">
<div class="pick">${L.slice(0, 60).map((x) => `<button data-pickc="${x.id}"><span class="ph" style="display:grid;place-items:center;font-size:20px">${(KIND[x.k] || KIND.other)[1]}</span><span><b>${esc(x.n)}</b><span>${x.st === "lead" ? "Lead" : "Client"}${x.area ? " · " + esc(x.area) : ""}</span></span></button>`).join("") || '<p class="mu sm" style="padding:10px">No match.</p>'}</div>
<button class="big lite" data-new="client">+ Add a new client</button></div>`;
      const i = s.body.querySelector("[data-cq]"); i.oninput = () => { cq = i.value; s.draw(); const n = s.body.querySelector("[data-cq]"); n.focus(); n.setSelectionRange(cq.length, cq.length); };
      s.body.querySelector(".pick").onclick = (e) => { const b = e.target.closest("[data-pickc]"); if (b) { O.cl = b.dataset.pickc; s.draw(); } };
      return;
    }
    const items = CAT ? CAT.items.filter((i) => !i.off) : [];
    const ql = q.trim().toLowerCase();
    const hits = ql ? items.filter((i) => (i.id + " " + i.n + " " + (i.a || "")).toLowerCase().includes(ql)).slice(0, 25) : [];
    const sub = O.lines.reduce((a, l) => a + l.q * (l.p || 0), 0), base = O.lines.reduce((a, l) => { const it = catItem(l.id); return a + (l.q + (+l.fr || 0)) * (it ? std(it) : l.p || 0); }, 0);
    const disc = Math.min(O.disc || 0, sub), extra = base > 0 ? Math.max(0, Math.round((1 - (sub - disc) / base) * 1000) / 10) : 0;
    const over = can("limit") && extra > (ME.mx || 0) + 0.05;
    const tb = sub - disc + (+O.ship || 0), tot = tb + tb * (+O.vat || 0) / 100;
    s.body.innerHTML = `<div class="card"><div class="row"><b style="flex:1">For ${esc(c.n)}</b>${old ? "" : `<button class="btn" data-chc>Change</button>`}</div>${cdc() ? `<p class="sm mu" style="margin:2px 0 0">Standing discount ${cdc()}% is already in the prices.</p>` : ""}
<label>Add products</label><input type="search" data-q2 placeholder="${CAT ? "Type a name or ref" : "Loading products…"}" value="${esc(q)}" autocomplete="off">
${hits.length ? `<div class="pick">${hits.map((i) => `<button data-add="${esc(i.id)}">${i.im ? `<img src="${esc(i.im)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span><b>${esc(i.n)}</b><span>${esc(i.id)} · ${i.p ? usd(std(i)) : "no price"}${i.s === 0 ? " · out of stock" : ""}${i.ob && i.of ? ` · offer ${i.ob}+${i.of}` : ""}</span></span></button>`).join("")}</div>` : ql ? '<p class="mu sm">No product matches.</p>' : ""}
${can("prices") ? `<button class="btn" data-custom style="margin-top:8px">+ Line not in the catalogue</button>` : ""}</div>
<div class="card">${O.lines.length ? O.lines.map((l, k) => {
      const it = catItem(l.id), sp = it ? std(it) : null, lp = sellAt(l), ld = lineDisc(l, lp);
      const fm = lineMode(l) === "f", fq = it && it.ob && fm ? Math.floor(l.q / it.ob) * it.of : 0, out = l.q + fq + (fm ? +l.fr || 0 : 0), short = it && it.s !== null && it.s !== undefined && out > it.s;
      const P = can("prices") ? "" : " disabled", sd = it ? Math.round((1 - std(it) / (it.p || 1)) * 1000) / 10 : 0;
      const tg = it && it.ob && it.of ? `<div class="opt2" role="radiogroup" aria-label="Discount or offer"><button role="radio" aria-checked="${!fm}" class="${fm ? "" : "on"}" data-m="d">${sd > 0 ? sd + "% discount" : "Discount"}</button><button role="radio" aria-checked="${fm}" class="${fm ? "on" : ""}" data-m="f">🎁 Offer ${it.ob}+${it.of}</button></div>` : "";
      return `<div class="ln" data-k="${k}"><div class="nm">${it || !can("prices") ? esc(l.n) : `<input data-l="n" value="${esc(l.n)}" placeholder="Description" maxlength="160">`}<small>${esc(l.id || "custom")}${sp !== null && sp !== lp ? ` · client price ${usd(sp)}` : ""}${it && it.s !== null && it.s !== undefined ? ` · stock ${it.s}` : ""}${fq ? ` · <b>+${fq} free (offer ${it.ob}+${it.of})</b>` : it && it.ob && fm && l.q < it.ob ? ` · offer from ${it.ob} units` : ""}</small></div><div class="r num"><b>${usd(l.q * (l.p || 0))}</b></div>${tg}
<div class="ctl"><label>Qty<input type="number" inputmode="numeric" min="1" step="1" data-l="q" value="${l.q}"></label><label>Price $<input ${DEC} data-l="lp" value="${lp ? lp.toFixed(2) : ""}" placeholder="0.00"${P}></label><label>Disc %<input ${DEC} data-l="ld" value="${fm ? "" : ld || ""}" placeholder="0"${P}></label><label>Net $<input ${DEC} data-l="p" value="${l.p ? (+l.p).toFixed(2) : ""}" placeholder="0.00"${P}></label><label>Free<input type="number" inputmode="numeric" min="0" step="1" data-l="fr" value="${fm ? +l.fr || "" : ""}" placeholder="0"${P}></label><button class="x" data-rm aria-label="Remove">✕</button></div>
${short ? `<div class="warnbox" style="margin-top:6px">⚠ ${out} units go out (${l.q} sold + ${out - l.q} free) but only ${it.s} in stock.</div>` : ""}</div>`; }).join("") : '<p class="mu sm" style="margin:0">No products yet. Search above to add.</p>'}${O.lines.length ? '<p class="mu sm" style="margin:8px 0 0">Price is the selling price. Disc % comes off it and gives the Net price you charge. Free items are given on top and come out of stock with the order. The client gets a discount <b>or</b> free goods on a line, never both: entering one clears the other.</p>' : ""}</div>
<div class="card"><div class="g2">${can("prices") ? `<label>Extra discount $<input ${DEC} data-o="disc" value="${O.disc || ""}" placeholder="0"></label>` : ""}<label>Delivery $<input ${DEC} data-o="ship" value="${O.ship || ""}" placeholder="0"></label><label>VAT %<input ${DEC} data-o="vat" value="${O.vat || ""}" placeholder="0"></label><label>Valid for (days)<input type="number" min="1" max="365" data-o="valid" value="${O.valid || 7}"></label></div>
<label>Note for the client<textarea data-o="note" rows="2" maxlength="600" placeholder="e.g. Delivery within 2 working days">${esc(O.note)}</textarea></label>
<div class="tots num"><div><span>Subtotal</span><b>${usd(sub)}</b></div>${disc ? `<div><span>Discount</span><b>−${usd(disc)}</b></div>` : ""}${+O.ship ? `<div><span>Delivery</span><b>${usd(+O.ship)}</b></div>` : ""}${+O.vat ? `<div><span>VAT ${+O.vat}%</span><b>${usd(tb * (+O.vat) / 100)}</b></div>` : ""}<div class="g"><span>Total</span><b>${usd(tot)}</b></div>${extra ? `<div class="sm mu"><span>Below standard prices</span><span>${extra}%</span></div>` : ""}</div>
${over ? `<div class="warnbox">⚠ This is ${extra}% below standard prices; your limit is ${ME.mx || 0}%. You can save it, and it needs approval in the Command Center before a proforma or an order.</div>` : ""}
<button class="big" data-save${O.lines.length ? "" : " disabled"}>${old ? "Save offer" : "Save offer"}</button></div>`;
    const B = s.body;
    const ch = B.querySelector("[data-chc]"); if (ch) ch.onclick = () => { O.cl = ""; s.draw(); };
    const qi = B.querySelector("[data-q2]"); qi.oninput = () => { q = qi.value; s.draw(); const n = s.body.querySelector("[data-q2]"); n.focus(); n.setSelectionRange(q.length, q.length); };
    const pk = B.querySelector(".pick"); if (pk) pk.onclick = (e) => { const b = e.target.closest("[data-add]"); if (!b) return; const it = catItem(b.dataset.add), have = O.lines.find((l) => l.id === it.id); if (have) have.q++; else { const m = it.ob && !(it.dc > 0) ? "f" : "d"; O.lines.push({ id: it.id, n: it.n, q: 1, m, p: m === "f" ? it.p || 0 : std(it) }); } q = ""; s.draw(); toast(`Added ${it.n}`); };
    const cu = B.querySelector("[data-custom]"); if (cu) cu.onclick = () => { O.lines.push({ id: "", n: "", q: 1, p: 0 }); s.draw(); };
    B.onchange = (e) => {
      const t = e.target, ln = t.closest(".ln");
      if (ln && t.dataset.l) {
        const l = O.lines[+ln.dataset.k], k = t.dataset.l, it = catItem(l.id);
        if (k === "n") l.n = t.value;
        else if (k === "q") l.q = Math.max(1, Math.floor(+t.value) || 1);
        else if (k === "fr") { l.fr = Math.max(0, Math.floor(+t.value) || 0); if (l.fr) setMode(l, "f"); }
        else if (k === "lp") { const d = lineMode(l) === "f" ? 0 : lineDisc(l, sellAt(l)), v = Math.round(Math.max(0, dec(t.value)) * 100) / 100; l.lp = v; l.p = Math.round(v * (1 - d / 100) * 100) / 100; }
        else if (k === "ld") { const d = Math.min(100, Math.max(0, dec(t.value))), lp = sellAt(l); if (d > 0) { l.m = "d"; l.fr = 0; } if (lp) l.p = Math.round(lp * (1 - d / 100) * 100) / 100; }
        else { l.p = Math.round(Math.max(0, dec(t.value)) * 100) / 100; if (l.p < sellAt(l)) { l.m = "d"; l.fr = 0; } }
        s.draw();
      }
      else if (t.dataset.o) { O[t.dataset.o] = t.dataset.o === "note" ? t.value : t.dataset.o === "valid" ? Math.max(1, Math.floor(dec(t.value)) || 7) : Math.max(0, dec(t.value)); if (t.dataset.o !== "note") s.draw(); }
    };
    B.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { setMode(O.lines[+b.closest(".ln").dataset.k], b.dataset.m); s.draw(); }));
    B.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { O.lines.splice(+b.closest(".ln").dataset.k, 1); s.draw(); }));
    B.querySelector("[data-save]").onclick = async (e) => {
      O.note = B.querySelector('[data-o="note"]').value;
      O.lines = O.lines.filter((l) => l.q > 0 && (l.id || l.n));
      if (!O.lines.length) return;
      e.target.disabled = true; e.target.textContent = "Saving…";
      try { const r = await post({ do: "offer", offer: O }); setDoc(r.doc); closeSheet(); if (!old) openOffer(r.offer.id); toast(r.offer.ap === "wait" ? "Saved. Waiting for approval of the discount." : "Offer saved."); }
      catch (err) { e.target.disabled = false; e.target.textContent = "Save offer"; fail(err); }
    };
  });
}

/* ---------- One offer: proforma, order, WhatsApp ---------- */
function openOffer(id) {
  sheet("Offer", (s) => {
    const o = DOC.of.find((x) => x.id === id); if (!o) { s.body.innerHTML = '<div class="empty">This offer was removed.</div>'; return; }
    const c = client(o.cl) || { n: "Client removed" }, tb = o.lines.reduce((a, l) => a + l.q * l.p, 0), blocked = o.ap === "wait" || o.ap === "no";
    s.title("Offer · " + c.n);
    s.body.innerHTML = `<div class="card"><div class="row"><b style="flex:1"><a href="#" data-open="${c.id}">${esc(c.n)}</a></b><span class="pill ${o.st === "won" ? "ok" : o.st === "lost" ? "bad" : ""}">${OST[o.st]}</span></div>
<p class="mu sm" style="margin:2px 0 0">Made ${dshort(o.at)}${o.up !== o.at ? ` · changed ${dshort(o.up)}` : ""} · valid ${o.valid} days${o.pf ? ` · proforma ${esc(o.pf)}` : ""}${o.ord ? ` · order #${esc(o.ord)}` : ""}</p>
${o.ap === "wait" ? `<div class="warnbox">⏳ ${o.extra}% below standard prices (your limit ${ME.mx || 0}%). Waiting for approval in the Command Center before a proforma or an order.</div>` : o.ap === "no" ? `<div class="badbox">✕ The discount was not approved. Edit the prices and save to ask again.</div>` : o.ap === "ok" ? `<div class="okbox">✓ Discount approved.</div>` : ""}
${o.lines.map((l) => `<div class="ln"><div class="nm">${esc(l.n)}<small>${esc(l.id || "custom")} · ${l.q} × ${usd(l.p)}${lineDisc(l, l.lp) ? ` (${lineDisc(l, l.lp)}% off ${usd(l.lp)})` : ""}${freeOf(l) ? ` · <b>+${freeOf(l)} free</b>` : ""}</small></div><div class="r num"><b>${usd(l.q * l.p)}</b></div></div>`).join("")}
<div class="tots num"><div><span>Subtotal</span><b>${usd(tb)}</b></div>${o.disc ? `<div><span>Discount</span><b>−${usd(o.disc)}</b></div>` : ""}${o.ship ? `<div><span>Delivery</span><b>${usd(o.ship)}</b></div>` : ""}${o.vat ? `<div><span>VAT ${o.vat}%</span><b>${usd((tb - o.disc + o.ship) * o.vat / 100)}</b></div>` : ""}<div class="g"><span>Total</span><b>${usd(offerTotal(o))}</b></div></div>
${o.note ? `<p class="sm" style="margin:8px 0 0">📝 ${esc(o.note)}</p>` : ""}</div>
<div class="card">
${can("proforma") ? `<button class="big go" data-pdf${blocked ? " disabled" : ""}>🧾 ${o.pfd ? "Open proforma " + esc(o.pf) : "Create proforma PDF"}</button>${o.pfd && !o.ord ? `<button class="big lite" data-pdfnew${blocked ? " disabled" : ""}>New proforma number with these prices</button>` : ""}` : ""}
${can("orders") && !o.ord ? `<button class="big ok" data-order${blocked ? " disabled" : ""}>🛒 Place the order</button>` : ""}
${o.ord ? `<div class="okbox">✓ Ordered as #${esc(o.ord)}. It is in the Command Center with the other orders.</div>` : ""}
<button class="big lite" data-wa>💬 Send the offer on WhatsApp</button>
<div class="row" style="margin-top:12px">${!o.ord ? `<button class="btn" data-edit>✏️ Edit</button>` : ""}${o.st !== "won" ? `<button class="btn" data-st="won">Mark won</button>` : ""}${o.st !== "lost" && !o.ord ? `<button class="btn" data-st="lost">Mark lost</button>` : ""}${o.st === "won" || o.st === "lost" ? (!o.ord ? `<button class="btn" data-st="open">Reopen</button>` : "") : ""}<span class="sp"></span>${can("remove") && !o.pf && !o.ord ? `<button class="btn dng" data-del>Delete</button>` : ""}</div></div>`;
    const B = s.body, on = (sel, fn) => { const x = B.querySelector(sel); if (x) x.onclick = fn; };
    on("[data-edit]", () => editOffer(o.id));
    B.querySelectorAll("[data-st]").forEach((b) => (b.onclick = async () => { try { setDoc((await post({ do: "offerstatus", id: o.id, st: b.dataset.st })).doc); toast("Offer: " + OST[b.dataset.st]); s.draw(); } catch (e) { fail(e); } }));
    on("[data-del]", async () => { if (!confirm("Delete this offer?")) return; try { setDoc((await post({ do: "deloffer", id: o.id })).doc); closeSheet(); toast("Offer deleted."); } catch (e) { fail(e); } });
    const mkPf = async (b) => { b.disabled = true; b.textContent = "Creating the proforma…"; try { const r = await post({ do: "proforma", id: o.id }); setDoc(r.doc); s.draw(); showPdf(r.proforma, c); } catch (e) { fail(e, "Could not create the proforma. Try again."); s.draw(); } };
    on("[data-pdf]", (e) => { if (o.pfd) showPdf(o.pfd, c); else mkPf(e.target); });
    on("[data-pdfnew]", (e) => { if (confirm("Make a new proforma with a new number? The old one stays valid for the client.")) mkPf(e.target); });
    on("[data-order]", async (e) => {
      if (!confirm(`Place an order of ${usd(offerTotal(o))} for ${c.n}? It goes to the Command Center to be confirmed and delivered.`)) return;
      e.target.disabled = true; e.target.textContent = "Placing the order…";
      try { const r = await post({ do: "order", id: o.id }); setDoc(r.doc); s.draw(); toast(`Order #${r.id} placed. The team sees it now.`); }
      catch (err) { fail(err, "Could not place the order. Try again."); s.draw(); }
    });
    on("[data-wa]", () => {
      const msg = `Hello${c.co ? " " + c.co : c.n ? " " + c.n : ""}, here is our offer:\n` + o.lines.map((l) => `• ${l.q} × ${l.n} — ${usd(l.p)}${lineDisc(l, l.lp) ? ` (${lineDisc(l, l.lp)}% off ${usd(l.lp)})` : ""}${freeOf(l) ? ` + ${freeOf(l)} free` : ""}`).join("\n")
        + `${o.disc ? `\nDiscount: −${usd(o.disc)}` : ""}${o.ship ? `\nDelivery: ${usd(o.ship)}` : ""}\nTotal: ${usd(offerTotal(o))}\nValid for ${o.valid} days.${o.note ? "\n" + o.note : ""}\n\n${ME.n}, Oxinab`;
      window.open(`https://wa.me/${c.tel ? intl(c.tel) : ""}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    });
  });
}
function showPdf(d, c) {
  sheet("Proforma " + d.no, async (s) => {
    if (s.done) return; s.done = true;
    s.body.innerHTML = `<div class="card"><div class="pfprev" data-prev><p class="mu">Making the PDF…</p></div><div data-act></div><p class="mu sm" data-hint style="margin:8px 0 0"></p></div>`;
    let out; try { out = await pfPdf(d); } catch (e) { s.body.querySelector("[data-prev]").innerHTML = '<p class="err">Could not make the PDF. Check your connection and try again.</p>'; return; }
    s.body.querySelector("[data-prev]").innerHTML = out.shots.map((u, i) => `<img src="${u}" alt="Page ${i + 1}">`).join("");
    const name = `Oxinab-proforma-${d.no}.pdf`, file = new File([out.blob], name, { type: "application/pdf" }), url = URL.createObjectURL(out.blob);
    const msg = `Hello${c && c.n ? " " + c.n : ""}, please find attached our proforma ${d.no}. Total: ${money2(pfSums(d).total)}. Valid for ${d.valid} days. Thank you, ${ME.n} · ${(d.cfg && d.cfg.co) || "Oxinab"}.`;
    const share = navigator.canShare && navigator.canShare({ files: [file] });
    s.body.querySelector("[data-act]").innerHTML = `${share ? `<button class="big go" data-share>📤 Share the PDF (WhatsApp…)</button>` : ""}<a class="big" href="${url}" download="${esc(name)}">⬇ Download PDF</a>${c && c.tel ? `<a class="big lite" target="_blank" rel="noopener" href="https://wa.me/${esc(intl(c.tel))}?text=${encodeURIComponent(msg)}">💬 Open WhatsApp chat with ${esc(c.n)}</a>` : ""}`;
    s.body.querySelector("[data-hint]").textContent = share ? "Share sends the PDF straight to WhatsApp or another app." : "Download the PDF, then attach it in the WhatsApp chat.";
    const sh = s.body.querySelector("[data-share]"); if (sh) sh.onclick = async () => { try { await navigator.share({ files: [file], title: `Proforma ${d.no}`, text: msg }); } catch (e) {} };
  });
}

/* ---------- Map ---------- */
let LF = null, MAP = null, PINS = null, MEPIN = null, ROUTE = null;
const loadLeaflet = () => LF || (LF = new Promise((ok, no) => { const c = document.createElement("link"); c.rel = "stylesheet"; c.href = "/vendor/leaflet/leaflet.css"; document.head.appendChild(c); const s = document.createElement("script"); s.src = "/vendor/leaflet/leaflet.js"; s.onload = ok; s.onerror = () => { LF = null; no(); }; document.head.appendChild(s); }));
const pinColor = (c) => (c.nx && c.nx <= today() ? "#c62828" : c.st === "lead" ? "#e8590c" : "#0573c4");
function drawMap() {
  const el = $("v-map");
  if (!el.dataset.built) {
    el.dataset.built = 1;
    el.innerHTML = `<div class="chips" data-chip="mf">${[["all", "All"], ["client", "Clients"], ["lead", "Leads"], ["due", "Follow-ups due"]].map(([k, t]) => `<button data-val="${k}" aria-pressed="${F.mf === k}">${t}</button>`).join("")}</div>
<div class="legend"><span><i style="background:#0573c4"></i>Client</span><span><i style="background:#e8590c"></i>Lead</span><span><i style="background:#c62828"></i>Follow-up due</span><span><i style="background:#1a73e8"></i>You</span></div>
<div id="map" role="region" aria-label="Map of clients and leads"></div>
<div class="row" style="margin-top:10px"><button class="btn" data-me>📍 Where am I</button><button class="btn pri" data-plan>🧭 Plan a visit route</button><span class="sp"></span><span class="mu sm" data-noloc></span></div><div data-route-out></div>`;
    el.querySelector("[data-me]").onclick = async () => { const p = await getPos(); if (!p) { toast("Allow location for this site to see where you are."); return; } drawMe(); MAP.setView([p.lat, p.lng], 14); };
    el.querySelector("[data-plan]").onclick = () => planRoute(false);
  }
  loadLeaflet().then(() => {
    if (!MAP) {
      MAP = L.map("map", { zoomControl: true }).setView([33.89, 35.5], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(MAP);
      PINS = L.layerGroup().addTo(MAP);
      getPos().then(drawMe);
    }
    setTimeout(() => MAP.invalidateSize(), 50);
    drawMapPins(true);
  }).catch(() => { $("map").innerHTML = '<div class="empty">The map could not load. Check your connection.</div>'; });
}
function mapList() { const t = today(); return DOC.cl.filter((c) => F.mf === "all" ? c.stg !== "lost" : F.mf === "due" ? c.nx && c.nx <= t : c.st === F.mf); }
function drawMapPins(fit) {
  if (!MAP) return;
  PINS.clearLayers();
  const L0 = mapList(), on = L0.filter(hasLoc);
  on.forEach((c) => {
    const k = KIND[c.k] || KIND.other;
    const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: `<div class="mk" style="background:${pinColor(c)}"></div>`, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] }), title: c.n });
    const div = document.createElement("div");
    div.innerHTML = `<b>${esc(c.n)}</b>${k[1]} ${k[0]}${c.st === "lead" ? " · " + STAGE[c.stg] : ""}${c.nx ? `<br>Follow-up ${daysFrom(c.nx) <= 0 ? "<b style='display:inline;color:#c62828'>due</b>" : dlong(c.nx)}` : ""}${POS ? `<br>${dist(metres(POS, c))} away` : ""}<div style="display:flex;gap:6px;margin-top:6px"><button class="btn pri" data-open="${c.id}" style="padding:5px 10px">Open</button><a class="btn" href="${mapsUrl(c)}" target="_blank" rel="noopener" style="padding:5px 10px">Directions</a></div>`;
    m.bindPopup(div); PINS.addLayer(m);
  });
  const miss = L0.length - on.length;
  const nl = document.querySelector("#v-map [data-noloc]"); if (nl) nl.textContent = miss ? `${miss} without a saved place` : "";
  if (fit && on.length) MAP.fitBounds(L.latLngBounds(on.map((c) => [c.lat, c.lng])).pad(0.2), { maxZoom: 15 });
}
function drawMe() { if (!MAP || !POS) return; if (MEPIN) MEPIN.setLatLng([POS.lat, POS.lng]); else MEPIN = L.marker([POS.lat, POS.lng], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, title: "You" }).addTo(MAP); }
/* Visit route: the follow-ups that are due (or the pins shown), nearest first from where you are, up to 10 stops. */
async function planRoute(dueOnly) {
  if (dueOnly) { F.mf = "due"; document.querySelectorAll('[data-chip="mf"] button').forEach((b) => b.setAttribute("aria-pressed", b.dataset.val === "due")); drawMapPins(true); }
  const out = document.querySelector("#v-map [data-route-out]"); if (!out) return;
  out.innerHTML = '<p class="mu sm">Finding your location…</p>';
  const p = POS && Date.now() - POS.t < 120000 ? POS : await getPos(15000);
  let left = mapList().filter(hasLoc);
  if (!left.length) { out.innerHTML = `<div class="card mu sm">No ${F.mf === "due" ? "follow-ups due" : "pins"} with a saved place. Places are saved at the first check-in, or with "I'm here now" when editing a client.</div>`; return; }
  let at = p || left[0]; const stops = [];
  while (left.length && stops.length < 10) { left.sort((a, b) => metres(at, a) - metres(at, b)); const n = left.shift(); stops.push({ c: n, d: metres(at, n) }); at = n; }
  const km = stops.reduce((s, x) => s + x.d, 0);
  const way = stops.slice(0, -1).map((x) => `${x.c.lat},${x.c.lng}`).join("|"), last = stops[stops.length - 1].c;
  const g = `https://www.google.com/maps/dir/?api=1${p ? `&origin=${p.lat},${p.lng}` : ""}&destination=${last.lat},${last.lng}${way ? `&waypoints=${encodeURIComponent(way)}` : ""}&travelmode=driving`;
  if (ROUTE) MAP.removeLayer(ROUTE);
  ROUTE = L.polyline([...(p ? [[p.lat, p.lng]] : []), ...stops.map((x) => [x.c.lat, x.c.lng])], { color: "#001765", weight: 3, dashArray: "6 6" }).addTo(MAP);
  MAP.fitBounds(ROUTE.getBounds().pad(0.15), { maxZoom: 15 });
  out.innerHTML = `<div class="card"><div class="row"><h3 style="font-size:16px;flex:1">${stops.length} stop${stops.length > 1 ? "s" : ""}, about ${dist(km)} in a straight line</h3></div>${p ? "" : '<p class="mu sm">Your location is off, so the route starts at the first stop.</p>'}
${stops.map((x, i) => row(x.c, `${i + 1}. ${x.c.area ? esc(x.c.area) + " · " : ""}${dist(x.d)}${x.c.nx ? " · " + fuText(x.c) : ""}`)).join("")}
<a class="big go" href="${g}" target="_blank" rel="noopener">Open the route in Google Maps</a></div>`;
}

/* ---------- Sign in and out ---------- */
$("lf").addEventListener("submit", async (e) => {
  e.preventDefault(); $("lerr").textContent = "";
  try { await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rep: $("lp").value, pin: $("lpin").value }) }); $("lpin").value = ""; load(); }
  catch (err) { $("lerr").textContent = err.status === 429 ? "Too many tries. Wait 15 minutes and try again." : err.status === 401 ? "Wrong phone number or PIN." : err.status === 503 ? "The app is not set up yet. Ask the admin." : "Could not connect. Try again."; }
});
$("out").onclick = async () => { if (openVisit() && !confirm("You are still checked in. Sign out anyway?")) return; try { await fetch("/api/admin/login", { method: "DELETE" }); } catch (e) {} showLogin(); };
document.addEventListener("visibilitychange", () => { if (!document.hidden && ME && !STACK.length) load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
load();
