/* Oxinab Command Center. Edits are kept here until "Publish changes" sends them to the live catalogue. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const clone = (o) => JSON.parse(JSON.stringify(o));
let LIVE = null, W = null, VERSION = null, ME = {}, TAB = "products";
let F = { q: "", cat: -1, st: "all", pg: 0 };
const PER = 50;

function toast(m) { const o = document.createElement("div"); o.className = "toast"; o.setAttribute("role", "status"); o.textContent = m; document.body.appendChild(o); setTimeout(() => o.remove(), 3800); }
async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opt });
  let b = {}; try { b = await r.json(); } catch {}
  if (r.status === 401 && path !== "/api/admin/login") { showLogin("Your session ended. Sign in again; your unpublished edits are kept on this page."); throw Object.assign(new Error("signed_out"), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(b.error || "error"), { status: r.status, body: b });
  return b;
}

/* ---------- Sign in ---------- */
function showLogin(msg) {
  $("login").hidden = false; $("app").hidden = !W;
  if (W) { $("app").hidden = true; }
  if (msg) $("lmsg").textContent = msg;
  setTimeout(() => $("pw").focus(), 50);
}
$("lf").onsubmit = async (e) => {
  e.preventDefault();
  $("lerr").textContent = ""; $("lbtn").disabled = true;
  try {
    await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) });
    $("pw").value = ""; $("login").hidden = true; await start();
  } catch (err) {
    const c = err.message;
    $("lerr").textContent = c === "wrong_password" ? "That password is not right. Check it and try again."
      : c === "locked" ? "Too many tries. Wait " + ((err.body && err.body.minutes) || 15) + " minutes, then try again."
      : c === "not_set_up" ? "The admin password has not been set in Vercel yet. Add ADMIN_PASSWORD (10 characters or more) in the project's Environment Variables, then redeploy."
      : "Could not sign in. Check your connection and try again.";
  } finally { $("lbtn").disabled = false; }
};
$("out").onclick = async () => {
  if (dirty() && !confirmTwice($("out"), "Sign out and lose edits?")) return;
  await fetch("/api/admin/login", { method: "DELETE" }); location.reload();
};
const armed = new WeakMap();
function confirmTwice(btn, label) {
  if (armed.get(btn)) { armed.delete(btn); return true; }
  const old = btn.textContent; btn.textContent = label; armed.set(btn, 1);
  setTimeout(() => { if (armed.get(btn)) { armed.delete(btn); btn.textContent = old; } }, 4000);
  return false;
}

/* ---------- Load and publish ---------- */
async function start() {
  ME = await api("/api/admin/me");
  if (!ME.signedIn) return showLogin();
  const r = await api("/api/admin/catalog");
  LIVE = r.data; VERSION = r.version;
  if (!W) W = clone(LIVE);
  $("app").hidden = false; $("login").hidden = true;
  warn(); render(); loadOrders();
}
function warn() {
  const w = [];
  if (!ME.storage) w.push("Storage is not connected to this project yet, so changes cannot be published.");
  if (!ME.push) w.push("Push notifications are not set up yet. Open the Notifications tab to turn them on.");
  $("warn").innerHTML = w.map((x) => `<div class="notice bad">${esc(x)}</div>`).join("");
}
const snap = (o) => JSON.stringify(o);
function changes() {
  if (!W || !LIVE) return 0;
  const a = new Map(LIVE.items.map((i) => [i.id, snap(i)]));
  let n = 0; const seen = new Set();
  W.items.forEach((i) => { seen.add(i.id); if (a.get(i.id) !== snap(i)) n++; });
  a.forEach((v, k) => { if (!seen.has(k)) n++; });
  if (snap(W.cats) !== snap(LIVE.cats)) n++;
  if (snap(W.banners || []) !== snap(LIVE.banners || [])) n++;
  const s1 = { ...W.set, upd: 0 }, s2 = { ...LIVE.set, upd: 0 };
  if (snap(s1) !== snap(s2)) n++;
  return n;
}
const dirty = () => changes() > 0;
function state() {
  const n = changes(), s = $("state");
  s.textContent = n ? n + (n === 1 ? " unpublished change" : " unpublished changes") : "All changes are live";
  s.classList.toggle("dirty", !!n);
  $("publish").disabled = !n || !ME.storage; $("discard").hidden = !n;
}
addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
$("publish").onclick = async () => {
  const b = $("publish"); b.disabled = true; b.textContent = "Publishing…";
  try {
    const r = await api("/api/admin/catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ base: VERSION, data: W }) });
    LIVE = r.data; VERSION = r.version; W = clone(LIVE);
    toast("Published. Customers see the changes within a few seconds.");
    render();
  } catch (e) {
    if (e.status === 401) return;
    toast(e.message === "conflict" ? "Someone else published changes. Reload the page to get them, then redo your edits."
      : e.message === "invalid" ? "Some details are not valid (" + ((e.body && e.body.detail) || "") + "). Fix them and publish again."
      : "Could not publish. Your edits are kept here; try again.");
  } finally { b.textContent = "Publish changes"; state(); }
};
$("discard").onclick = () => { if (!confirmTwice($("discard"), "Tap again to discard")) return; W = clone(LIVE); render(); toast("Changes discarded."); };

/* ---------- Tabs ---------- */
document.querySelector("nav.tabs").onclick = (e) => {
  const b = e.target.closest("button[data-t]"); if (!b) return;
  TAB = b.dataset.t;
  document.querySelectorAll("nav.tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
  ["products", "orders", "banners", "cats", "push", "settings"].forEach((t) => ($("t-" + t).hidden = t !== TAB));
  render();
};
function render() { state(); ({ products: renderProducts, orders: renderOrders, banners: renderBanners, cats: renderCats, push: renderPush, settings: renderSettings })[TAB](); }

/* ---------- Products ---------- */
const live = (id) => LIVE.items.find((i) => i.id === id);
const gi = (id) => W.items.find((i) => i.id === id);
const low = () => W.set.low || 0;
const noStock = (i) => i.s == null, isOut = (i) => i.s == null || i.s === 0, isLow = (i) => i.s != null && i.s > 0 && low() && i.s <= low();
function list() {
  const q = F.q.toLowerCase();
  return W.items.filter((i) => (F.cat < 0 || i.k === F.cat)
    && (F.st === "all" || (F.st === "on" && !i.off) || (F.st === "off" && i.off) || (F.st === "out" && isOut(i)) || (F.st === "low" && isLow(i)) || (F.st === "none" && noStock(i)))
    && (i.id + " " + i.n + " " + (i.a || "")).toLowerCase().includes(q));
}
function renderProducts() {
  const el = $("t-products");
  if (!el.dataset.ready) {
    el.innerHTML = `<div class="sum" id="sum"></div>
<div class="bar"><input id="fq" type="search" placeholder="Search name or ref" aria-label="Search products">
<select id="fc" aria-label="Category"></select>
<select id="fs" aria-label="Status"><option value="all">All products</option><option value="on">Online</option><option value="off">Offline</option><option value="out">Out of stock</option><option value="low">Low stock</option><option value="none">No stock entered</option></select>
<button class="btn pri" id="new">+ New product</button></div>
<div class="tw"><table><thead><tr><th></th><th>Ref</th><th>Name</th><th>Category</th><th>Price ($)</th><th>Stock</th><th>Online</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
<div class="pg" id="pg"></div>`;
    el.dataset.ready = 1;
    $("fq").oninput = (e) => { F.q = e.target.value; F.pg = 0; rows(); };
    $("fc").onchange = (e) => { F.cat = +e.target.value; F.pg = 0; rows(); };
    $("fs").onchange = (e) => { F.st = e.target.value; F.pg = 0; rows(); };
    $("new").onclick = () => edit(null);
    $("rows").addEventListener("change", (e) => {
      const tr = e.target.closest("tr[data-id]"); if (!tr) return; const i = gi(tr.dataset.id);
      if (e.target.dataset.f === "p") { const v = parseFloat(e.target.value); i.p = isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0; }
      if (e.target.dataset.f === "s") { const v = e.target.value.trim(); i.s = v === "" ? null : Math.max(0, Math.floor(+v) || 0); }
      if (e.target.dataset.f === "on") i.off = e.target.checked ? 0 : 1;
      rows(); state();
    });
    $("rows").addEventListener("click", (e) => { const b = e.target.closest("button[data-edit]"); if (b) edit(b.dataset.edit); });
    $("sum").onclick = (e) => { const b = e.target.closest("button[data-st]"); if (!b) return; F.st = b.dataset.st; $("fs").value = F.st; F.pg = 0; rows(); };
  }
  $("fc").innerHTML = `<option value="-1">All categories</option>` + W.cats.map((c, i) => `<option value="${i}" ${F.cat === i ? "selected" : ""}>${esc(c.n)}</option>`).join("");
  rows();
}
function rows() {
  const it = list(), pages = Math.max(1, Math.ceil(it.length / PER));
  F.pg = Math.min(F.pg, pages - 1);
  const on = W.items.filter((i) => !i.off).length;
  $("sum").innerHTML = `<button data-st="all"><b>${W.items.length}</b><span>Products</span></button><button data-st="on"><b>${on}</b><span>Online</span></button><button data-st="off"><b>${W.items.length - on}</b><span>Offline</span></button><button data-st="low" class="w"><b>${W.items.filter(isLow).length}</b><span>Low stock</span></button><button data-st="out" class="x"><b>${W.items.filter(isOut).length}</b><span>Out of stock</span></button><button data-st="none"><b>${W.items.filter(noStock).length}</b><span>No stock entered</span></button>`;
  $("rows").innerHTML = it.slice(F.pg * PER, F.pg * PER + PER).map((i) => {
    const c = W.cats[i.k] || { n: "?", e: "📦" }, chg = snap(live(i.id) || {}) !== snap(i);
    const pill = noStock(i) ? '<span class="pill out" title="No stock number entered, so customers see Out of stock.">Not set</span>' : isOut(i) ? '<span class="pill out">Out</span>' : isLow(i) ? '<span class="pill low">Low</span>' : "";
    return `<tr data-id="${esc(i.id)}" class="${i.off ? "off" : ""}${chg ? " chg" : ""}"><td class="th">${i.im ? `<img src="${esc(i.im)}" alt="" loading="lazy">` : `<span>${c.e}</span>`}</td><td><span class="ref">${esc(i.id)}</span></td><td>${esc(i.n)}<small>${esc(i.a || "")}</small></td><td>${esc(c.n)}</td><td><input class="n" type="number" min="0" step="0.01" inputmode="decimal" value="${i.p || 0}" data-f="p" aria-label="Price of ${esc(i.id)}"></td><td><div class="row"><input class="n" type="number" min="0" step="1" inputmode="numeric" placeholder="—" value="${i.s == null ? "" : i.s}" data-f="s" aria-label="Stock of ${esc(i.id)}">${pill}</div></td><td><label class="sw"><input type="checkbox" data-f="on" ${i.off ? "" : "checked"} aria-label="${esc(i.id)} online"><i></i></label></td><td><button class="btn" data-edit="${esc(i.id)}">Edit</button></td></tr>`;
  }).join("") || `<tr><td colspan="8" class="mu">No products match.</td></tr>`;
  $("pg").innerHTML = pages > 1 ? `<button class="btn" id="pp" ${F.pg < 1 ? "disabled" : ""}>‹ Previous</button><span class="mu sm">Page ${F.pg + 1} of ${pages} · ${it.length} products</span><button class="btn" id="pn" ${F.pg >= pages - 1 ? "disabled" : ""}>Next ›</button>` : `<span class="mu sm">${it.length} products · Empty stock shows as out of stock</span>`;
  if ($("pp")) { $("pp").onclick = () => { F.pg--; rows(); }; $("pn").onclick = () => { F.pg++; rows(); }; }
}
function nextRef(k) {
  const pre = "OX-" + (k + 1);
  let n = 1; while (W.items.some((i) => i.id === pre + String(n).padStart(2, "0"))) n++;
  return pre + String(n).padStart(2, "0");
}
let E = null, ENEW = false;
function edit(id) {
  ENEW = !id;
  E = id ? clone(gi(id)) : { id: nextRef(F.cat >= 0 ? F.cat : 0), k: F.cat >= 0 ? F.cat : 0, n: "", a: "", d: "", ad: "", p: 0, s: null, off: 0, im: "" };
  const m = document.createElement("div"); m.className = "mod"; m.id = "mod";
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${ENEW ? "New product" : "Edit " + esc(E.id)}">
<h2 style="font-size:19px">${ENEW ? "New product" : "Edit " + esc(E.id)}</h2>
<div class="photo"><span id="eph"></span><div class="row"><label class="btn">Upload photo<input id="efile" type="file" accept="image/*" hidden></label><button class="btn" id="erm">Remove photo</button></div><span class="mu sm" id="eup"></span></div>
<div class="g2">
<label class="f">Ref<input id="e_id" value="${esc(E.id)}" ${ENEW ? "" : "readonly"} maxlength="24"></label>
<label class="f">Category<select id="e_k">${W.cats.map((c, k) => `<option value="${k}" ${k === E.k ? "selected" : ""}>${esc(c.n)}</option>`).join("")}</select></label>
<label class="f">Name (English)<input id="e_n" value="${esc(E.n)}" maxlength="140"></label>
<label class="f">Name (Arabic)<input id="e_a" dir="rtl" value="${esc(E.a)}" maxlength="140"></label>
<label class="f">Description (English)<textarea id="e_d" rows="2" maxlength="400">${esc(E.d)}</textarea></label>
<label class="f">Description (Arabic)<textarea id="e_ad" dir="rtl" rows="2" maxlength="400">${esc(E.ad)}</textarea></label>
<label class="f">Price ($)<input id="e_p" type="number" min="0" step="0.01" inputmode="decimal" value="${E.p || 0}"></label>
<label class="f">Stock (empty shows as out of stock)<input id="e_s" type="number" min="0" step="1" inputmode="numeric" value="${E.s == null ? "" : E.s}"></label>
</div>
<label class="row"><span class="sw"><input id="e_on" type="checkbox" ${E.off ? "" : "checked"}><i></i></span> Online (visible in the catalogue)</label>
<p class="err" id="emsg" role="alert"></p>
<div class="row"><button class="btn pri" id="eok">${ENEW ? "Add product" : "Save"}</button><button class="btn" id="ecx">Cancel</button><span class="sp"></span>${ENEW ? "" : '<button class="btn dng" id="edel">Delete product</button>'}</div>
</div>`;
  document.body.appendChild(m);
  const ph = () => { $("eph").innerHTML = E.im ? `<img src="${esc(E.im)}" alt="">` : `<span class="ph">No photo</span>`; };
  ph();
  $("efile").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    $("eup").textContent = "Uploading…"; $("eok").disabled = true;
    try { E.im = await uploadPhoto(f); ph(); $("eup").textContent = "Photo uploaded."; }
    catch (e) { if (e.status !== 401) $("eup").textContent = "Upload failed. Try another photo (JPG or PNG)."; }
    finally { $("eok").disabled = false; ev.target.value = ""; }
  };
  $("erm").onclick = () => { E.im = ""; ph(); };
  $("ecx").onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
  $("eok").onclick = () => {
    const msg = (t) => ($("emsg").textContent = t);
    const ref = $("e_id").value.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_./-]/g, "");
    const n = $("e_n").value.trim(), p = parseFloat($("e_p").value || "0"), sv = $("e_s").value.trim();
    if (!ref) return msg("Enter a ref, for example OX-120.");
    if (ENEW && gi(ref)) return msg("That ref is already used. Choose another.");
    if (!n) return msg("Enter the English name.");
    if (!isFinite(p) || p < 0) return msg("Enter a price of 0 or more.");
    Object.assign(E, { id: ref, k: +$("e_k").value, n, a: $("e_a").value.trim(), d: $("e_d").value.trim(), ad: $("e_ad").value.trim(), p: Math.round(p * 100) / 100, s: sv === "" ? null : Math.max(0, Math.floor(+sv) || 0), off: $("e_on").checked ? 0 : 1 });
    if (ENEW) W.items.unshift(E); else Object.assign(gi(E.id), E);
    close(); render(); toast(ENEW ? "Product added. Publish to make it live." : "Saved. Publish to make it live.");
  };
  if ($("edel")) $("edel").onclick = () => {
    if (!confirmTwice($("edel"), "Tap again to delete")) return;
    W.items = W.items.filter((i) => i.id !== E.id); close(); render(); toast("Product deleted. Publish to make it live.");
  };
  setTimeout(() => (ENEW ? $("e_n") : $("e_p")).focus(), 30);
}
function close() { const m = $("mod"); if (m) m.remove(); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
async function uploadPhoto(file, max = 900) {
  const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
  const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
  const r = await api("/api/admin/upload", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
  return r.url;
}

/* ---------- Home page slides (brands and offers) ---------- */
function renderBanners() {
  if (!W.banners) W.banners = [];
  const B = W.banners, el = $("t-banners");
  const link = (b, n) => {
    const m = /^c(\d+)$/.exec(b.go || ""), kind = m ? "c" : (b.go || "").startsWith("q:") ? "q" : "";
    return `<label class="f">When tapped, open<select data-f="gk"><option value="">Nothing (picture only)</option><option value="q" ${kind === "q" ? "selected" : ""}>A search</option><option value="c" ${kind === "c" ? "selected" : ""}>A category</option></select></label>`
      + (kind === "q" ? `<label class="f">Search for<input data-f="gq" value="${esc(b.go.slice(2))}" maxlength="60" placeholder="e.g. Biosynex"></label>` : "")
      + (kind === "c" ? `<label class="f">Category<select data-f="gc">${W.cats.map((c, k) => `<option value="${k}" ${+m[1] === k ? "selected" : ""}>${esc(c.n)}</option>`).join("")}</select></label>` : "");
  };
  el.innerHTML = `<div class="panel" style="max-width:860px"><h2 style="font-size:18px">Home page slides</h2>
<p class="mu sm" style="margin:0">Brands and offers that slide across the top of the catalogue. A square product photo shows beside the text on the slide colour. A wide banner (about 3 × 1, for example 1500 × 500) fills the whole slide; leave the title empty if the banner already has its own text. Up to 12 slides; hidden slides are kept here but not shown.</p>
<div id="blist">${B.length ? B.map((b, n) => `<div class="bn${b.on ? "" : " hid"}" data-n="${n}">
<div class="bprev" style="--bg:${esc(b.bg)}">${b.im ? `<img src="${esc(b.im)}" alt="">` : `<span>No picture</span>`}<b>${esc(b.t || "(no title)")}</b></div>
<div class="bf">
 <div class="row"><b>Slide ${n + 1}</b><label class="sw" title="Show on the catalogue"><input type="checkbox" data-f="on" ${b.on ? "checked" : ""} aria-label="Show slide ${n + 1}"><i></i></label><span class="mu sm">${b.on ? "Shown" : "Hidden"}</span><span class="sp"></span>
 <button class="btn" data-mv="-1" ${n ? "" : "disabled"} aria-label="Move up">↑</button><button class="btn" data-mv="1" ${n < B.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button><button class="btn dng" data-del>Delete</button></div>
 <div class="row"><label class="btn">${b.im ? "Change picture" : "Upload picture"}<input type="file" accept="image/jpeg,image/png,image/webp" data-up hidden></label>${b.im ? `<button class="btn" data-noimg>Remove picture</button>` : ""}<label class="row sm mu" style="gap:6px">Slide colour<input type="color" data-f="bg" value="${esc(b.bg)}" aria-label="Slide colour"></label><span class="mu sm" data-msg></span></div>
 <div class="g2"><label class="f">Title (English)<input data-f="t" value="${esc(b.t)}" maxlength="80"></label><label class="f">Title (Arabic)<input class="ar" dir="rtl" data-f="ta" value="${esc(b.ta)}" maxlength="80"></label>
 <label class="f">Text (English)<input data-f="s" value="${esc(b.s)}" maxlength="160"></label><label class="f">Text (Arabic)<input class="ar" dir="rtl" data-f="sa" value="${esc(b.sa)}" maxlength="160"></label>
 <label class="f">Small label (English)<input data-f="l" value="${esc(b.l)}" maxlength="24" placeholder="e.g. Offer, New, Brand"></label><label class="f">Small label (Arabic)<input class="ar" dir="rtl" data-f="la" value="${esc(b.la)}" maxlength="24" placeholder="مثلاً: عرض، جديد"></label>
 ${link(b, n)}</div>
</div></div>`).join("") : `<p class="mu">No slides yet. The slider is hidden on the catalogue until you add one.</p>`}</div>
<div class="row"><button class="btn pri" id="badd" ${B.length >= 12 ? "disabled" : ""}>+ Add slide</button><span class="mu sm">Publish changes to put the slides live.</span></div></div>`;
  const L = $("blist"), at = (e) => { const r = e.target.closest(".bn"); return r ? [r, B[+r.dataset.n]] : []; };
  L.oninput = (e) => {
    const [r, b] = at(e), f = e.target.dataset.f; if (!b || !f || f === "gk" || f === "gc" || f === "on") return;
    if (f === "gq") b.go = "q:" + e.target.value; else b[f] = e.target.value;
    if (f === "t") r.querySelector(".bprev b").textContent = b.t || "(no title)";
    if (f === "bg") r.querySelector(".bprev").style.setProperty("--bg", b.bg);
    state();
  };
  L.onchange = async (e) => {
    const [r, b] = at(e); if (!b) return; const f = e.target.dataset.f;
    if (f === "on") { b.on = e.target.checked ? 1 : 0; renderBanners(); state(); return; }
    if (f === "gk") { b.go = e.target.value === "c" ? "c0" : e.target.value === "q" ? "q:" : ""; renderBanners(); state(); return; }
    if (f === "gc") { b.go = "c" + e.target.value; state(); return; }
    if (e.target.hasAttribute("data-up")) {
      const file = e.target.files[0]; if (!file) return; const msg = r.querySelector("[data-msg]"); msg.textContent = "Uploading…";
      try { b.im = await uploadPhoto(file, 1600); renderBanners(); state(); toast("Picture uploaded. Publish changes to put it live."); }
      catch (err) { if (err.status !== 401) msg.textContent = "Upload failed. Try a JPG or PNG under 3 MB."; }
    }
  };
  L.onclick = (e) => {
    const [, b] = at(e); if (!b) return; const n = B.indexOf(b);
    const mv = e.target.closest("[data-mv]");
    if (mv) { const j = n + +mv.dataset.mv; [B[n], B[j]] = [B[j], B[n]]; renderBanners(); state(); }
    if (e.target.closest("[data-noimg]")) { b.im = ""; renderBanners(); state(); }
    const d = e.target.closest("[data-del]");
    if (d && confirmTwice(d, "Tap again to delete")) { B.splice(n, 1); renderBanners(); state(); }
  };
  $("badd").onclick = () => { B.push({ im: "", t: "New offer", ta: "", s: "", sa: "", l: "Offer", la: "عرض", go: "", bg: "#001765", on: 1 }); renderBanners(); state(); $("blist").lastElementChild.scrollIntoView({ block: "center" }); };
}

/* ---------- Categories ---------- */
function renderCats() {
  const el = $("t-cats"), count = (k) => W.items.filter((i) => i.k === k).length;
  el.innerHTML = `<div class="panel"><h2 style="font-size:18px">Categories</h2><p class="mu sm" style="margin:0">The order here is the order of the filter buttons in the catalogue. A category can be deleted once it has no products.</p>
<div id="clist">${W.cats.map((c, k) => `<div class="cat" data-k="${k}"><span class="dot" style="background:${esc(c.c)}"></span><input value="${esc(c.e)}" data-f="e" aria-label="Icon" maxlength="8"><input value="${esc(c.n)}" data-f="n" aria-label="Name (English)" maxlength="60"><input class="ar" value="${esc(c.a)}" data-f="a" dir="rtl" aria-label="Name (Arabic)" maxlength="60"><input class="cl" type="color" value="${esc(c.c)}" data-f="c" aria-label="Colour"><div class="row acts"><span class="mu sm">${count(k)} products</span><button class="btn" data-mv="-1" ${k ? "" : "disabled"} aria-label="Move up">↑</button><button class="btn" data-mv="1" ${k < W.cats.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button><button class="btn dng" data-del ${count(k) ? "disabled" : ""}>Delete</button></div></div>`).join("")}</div>
<div class="row"><button class="btn pri" id="cadd">+ Add category</button></div></div>`;
  $("clist").oninput = (e) => { const r = e.target.closest(".cat"); if (!r || !e.target.dataset.f) return; W.cats[+r.dataset.k][e.target.dataset.f] = e.target.value; if (e.target.dataset.f === "c") r.querySelector(".dot").style.background = e.target.value; state(); };
  $("clist").onclick = (e) => {
    const r = e.target.closest(".cat"); if (!r) return; const k = +r.dataset.k;
    const mv = e.target.closest("[data-mv]");
    if (mv) { const j = k + +mv.dataset.mv; [W.cats[k], W.cats[j]] = [W.cats[j], W.cats[k]]; W.items.forEach((i) => { if (i.k === k) i.k = j; else if (i.k === j) i.k = k; }); (W.banners || []).forEach((b) => { if (b.go === "c" + k) b.go = "c" + j; else if (b.go === "c" + j) b.go = "c" + k; }); renderCats(); state(); }
    if (e.target.closest("[data-del]")) { W.cats.splice(k, 1); W.items.forEach((i) => { if (i.k > k) i.k--; }); (W.banners || []).forEach((b) => { const m = /^c(\d+)$/.exec(b.go); if (m && +m[1] === k) b.go = ""; else if (m && +m[1] > k) b.go = "c" + (m[1] - 1); }); F.cat = -1; renderCats(); state(); }
  };
  $("cadd").onclick = () => { W.cats.push({ n: "New category", a: "", c: "#008dd5", e: "📦" }); renderCats(); state(); };
}

/* ---------- Notifications ---------- */
function renderPush() {
  const el = $("t-push"), n = ME.subscribers;
  const setup = ME.push ? "" : `<div class="panel" style="margin-bottom:14px"><h2 style="font-size:18px">Turn on notifications (one time)</h2>
<p class="mu sm" style="margin:0">Press the button to make your private push keys. Copy each one into Vercel: open the project, then Settings, then Environment Variables, add it with the name shown, then redeploy. Keep the private key secret.</p>
<div class="row"><button class="btn" id="mkkeys">Make push keys</button></div><div id="keys"></div></div>`;
  el.innerHTML = setup + `<div class="panel"><h2 style="font-size:18px">Send an offer</h2>
<p style="margin:0"><b style="font-size:22px;font-variant-numeric:tabular-nums">${n == null ? "—" : n}</b> <span class="mu">${n === 1 ? "phone has" : "phones have"} offers turned on.</span></p>
<p class="mu sm" style="margin:0">Customers turn offers on with the 🔔 button in the catalogue. On iPhone they first add the app to the home screen.</p>
<label class="f">Title<input id="ptitle" maxlength="80" placeholder="e.g. 15% off Burnshield kits"></label>
<label class="f">Message<textarea id="pbody" rows="3" maxlength="240" placeholder="e.g. This week only. Order on WhatsApp."></textarea></label>
<label class="f">Opens<select id="purl"><option value="/">The catalogue</option>${W.cats.map((c, k) => `<option value="/#c${k}">${esc(c.n)}</option>`).join("")}</select></label>
<div class="preview" aria-hidden="true"><img src="/icons/icon-192.png" alt=""><div><b id="pvt">Oxinab</b><span class="mu sm" id="pvb">Your message appears here.</span></div></div>
<p class="err" id="pmsg" role="status"></p>
<div class="row"><button class="btn pri" id="psend" ${ME.push && n ? "" : "disabled"}>Send to ${n || 0} ${n === 1 ? "phone" : "phones"}</button></div></div>`;
  if (!ME.push) $("mkkeys").onclick = async () => {
    try {
      const r = await api("/api/admin/push-keys", { method: "POST" });
      $("keys").innerHTML = Object.entries(r).map(([k, v]) => `<label class="f">${k}<input readonly value="${esc(v)}" onfocus="this.select()"></label>`).join("");
      $("mkkeys").hidden = true;
    } catch (e) { $("keys").textContent = "Could not make keys. Try again."; }
  };
  const pv = () => { $("pvt").textContent = $("ptitle").value || "Oxinab"; $("pvb").textContent = $("pbody").value || "Your message appears here."; };
  $("ptitle").oninput = $("pbody").oninput = pv;
  $("psend").onclick = async () => {
    const b = $("psend"), t = $("ptitle").value.trim(), m = $("pbody").value.trim();
    if (!t || !m) { $("pmsg").textContent = "Write a title and a message first."; return; }
    if (!confirmTwice(b, "Tap again to send now")) return;
    b.disabled = true; $("pmsg").textContent = "Sending…";
    try {
      const r = await api("/api/admin/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t, body: m, url: $("purl").value }) });
      $("pmsg").textContent = `Sent to ${r.sent} ${r.sent === 1 ? "phone" : "phones"}.` + (r.removed ? ` ${r.removed} phones had turned offers off and were removed.` : "") + (r.failed ? ` ${r.failed} could not be reached.` : "");
      ME.subscribers = r.total - r.removed;
    } catch (e) { if (e.status !== 401) $("pmsg").textContent = "Could not send. Try again in a minute."; }
    finally { b.disabled = false; b.textContent = `Send to ${ME.subscribers || 0} phones`; }
  };
}

/* ---------- Settings ---------- */
function renderSettings() {
  const el = $("t-settings"), s = W.set;
  el.innerHTML = `<div class="panel"><h2 style="font-size:18px">Settings</h2>
<label class="row"><span class="sw"><input id="sprice" type="checkbox" ${s.price ? "checked" : ""}><i></i></span> Show prices in the catalogue (products with price 0 show "Ask for a quote")</label>
<label class="f">WhatsApp number for orders<input id="swa" inputmode="tel" value="${esc(s.wa)}" placeholder="96176878113"></label>
<p class="mu sm" style="margin:0">Country code and number, digits only. Orders from the basket are sent to this number.</p>
<label class="f">Low-stock warning at<input id="slow" type="number" min="0" step="1" value="${s.low || 0}"></label>
<p class="mu sm" style="margin:0">When stock is at or below this number the catalogue shows "Only N left". 0 turns the warning off.</p></div><div id="pfcfg" style="margin-top:14px"></div>`;
  if (typeof pfSettings === "function") pfSettings();
  $("sprice").onchange = (e) => { s.price = e.target.checked ? 1 : 0; state(); };
  $("swa").oninput = (e) => { s.wa = e.target.value.replace(/\D/g, "").replace(/^00/, ""); state(); };
  $("slow").oninput = (e) => { s.low = Math.max(0, Math.floor(+e.target.value) || 0); state(); };
}

start().catch((e) => { if (e.status !== 401) showLogin(); });

/* ---------- Orders ---------- */
// Every "Send order on WhatsApp" tap in the catalogue is saved here with its order number.
let ORD = null, OF = { q: "", st: "all", per: "all" };
const ST = { new: "New", confirmed: "Confirmed", delivered: "Delivered", cancelled: "Cancelled" };
async function loadOrders() {
  try { ORD = (await api("/api/admin/orders")).orders; } catch (e) { if (e.status === 401) return; ORD = ORD || []; }
  const n = ORD.filter((o) => o.status === "new").length;
  $("obadge").hidden = !n; $("obadge").textContent = n;
  if (TAB === "orders") renderOrders();
}
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const usd = (v) => "$" + Number(v).toFixed(2);
function renderOrders() {
  const el = $("t-orders");
  if (!ORD) { el.innerHTML = '<p class="mu">Loading orders…</p>'; return; }
  const cnt = (s) => ORD.filter((o) => o.status === s).length;
  el.innerHTML = `<div class="sum" id="osum"><button data-st="all"><b>${ORD.length}</b><span>All orders</span></button>${Object.keys(ST).map((s) => `<button data-st="${s}"${s === "cancelled" ? ' class="x"' : s === "new" ? ' class="w"' : ""}><b>${cnt(s)}</b><span>${ST[s]}</span></button>`).join("")}</div>
<div class="bar"><input type="search" id="oq" placeholder="Search order number, name, phone or product" value="${esc(OF.q)}" aria-label="Search orders">
<select id="ost" aria-label="Status"><option value="all">All statuses</option>${Object.keys(ST).map((s) => `<option value="${s}">${ST[s]}</option>`).join("")}</select>
<select id="oper" aria-label="Period"><option value="all">Any time</option><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
<button class="btn" id="oref">Refresh</button><button class="btn pri" id="pfnew">+ New proforma</button></div><div id="olist"></div>
<p class="mu sm">An order is saved when a customer taps "Send order on WhatsApp". If they then don't send the message, mark it Cancelled.</p><div id="pflist"></div>`;
  $("ost").value = OF.st; $("oper").value = OF.per;
  $("oq").oninput = (e) => { OF.q = e.target.value; list(); };
  $("ost").onchange = (e) => { OF.st = e.target.value; list(); };
  $("oper").onchange = (e) => { OF.per = e.target.value; list(); };
  $("osum").onclick = (e) => { const b = e.target.closest("button[data-st]"); if (!b) return; OF.st = b.dataset.st; $("ost").value = OF.st; list(); };
  $("oref").onclick = async () => { $("oref").disabled = true; await loadOrders(); };
  $("olist").onchange = async (e) => {
    const sel = e.target.closest("select[data-o]"); if (!sel) return;
    const o = ORD.find((x) => x.id === sel.dataset.o), old = o.status;
    sel.disabled = true;
    try { await api("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: o.id, status: sel.value }) }); o.status = sel.value; toast(`Order #${o.id} marked ${ST[o.status]}.`); }
    catch (err) { sel.value = old; toast("Could not change the status. Try again."); }
    $("obadge").hidden = !cnt("new"); $("obadge").textContent = cnt("new");
    renderOrders();
  };
  list(); if (typeof pfOrdersHook === "function") pfOrdersHook();
  function list() {
    const q = OF.q.trim().toLowerCase(), since = OF.per === "all" ? 0 : OF.per === "1" ? new Date().setHours(0, 0, 0, 0) : Date.now() - OF.per * 864e5;
    const it = ORD.filter((o) => (OF.st === "all" || o.status === OF.st) && new Date(o.at) >= since
      && (!q || [o.id, o.name, o.phone, o.addr, ...o.items.map((i) => i.id + " " + i.n)].join(" ").toLowerCase().includes(q)));
    $("olist").innerHTML = it.length ? it.map((o) => {
      const tel = (o.phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "").replace(/^0/, "961");
      return `<article class="ord ${o.status}"><div><h3>Order #${esc(o.id)} <span class="st-${o.status} sm">● ${ST[o.status]}</span></h3>
<ul>${o.items.map((i) => `<li>${i.q} × ${esc(i.n)} <span class="mu sm">${esc(i.id)}${i.p ? " · " + usd(i.p) : ""}</span></li>`).join("")}</ul></div>
<div style="text-align:end"><b style="font-size:17px">${o.total != null ? usd(o.total) : '<span class="mu sm">No total (prices missing)</span>'}</b><br>
<select data-o="${esc(o.id)}" aria-label="Status of order ${esc(o.id)}" style="margin-top:6px">${Object.keys(ST).map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${ST[s]}</option>`).join("")}</select><br><button class="btn" data-pf="${esc(o.id)}" style="margin-top:6px">📄 Proforma</button></div>
<div class="meta"><span>🕒 ${when(o.at)}</span><span>👤 ${esc(o.name || "No name given")}</span>${o.phone ? `<span>📞 <a href="https://wa.me/${esc(tel)}" target="_blank" rel="noopener">${esc(o.phone)}</a></span>` : ""}${o.addr ? `<span>📍 ${esc(o.addr)}</span>` : ""}<span>${o.lang === "ar" ? "Arabic" : "English"}</span></div></article>`;
    }).join("") : `<div class="panel"><p class="mu" style="margin:0">${ORD.length ? "No orders match these filters." : "No orders yet. They appear here when customers send an order from the catalogue."}</p></div>`;
  }
}
setInterval(() => { if (ME.signedIn && !document.hidden) loadOrders(); }, 60000);
