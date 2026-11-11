/* Oxinab Command Center: proformas (quotes) for clients.
   Made from an order or from scratch, numbered by the server (PF-2026-0001), drawn as an A4 PDF in the browser,
   then downloaded or shared to the client on WhatsApp. Uses the helpers in admin.js ($, esc, api, toast, W, ORD). */
let PF = null; // { cfg, docs }
const money2 = (v) => "$" + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dfmt = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
async function pfLoad(force) {
  if (PF && !force) return PF;
  PF = await api("/api/admin/proforma");
  return PF;
}
function pfSums(d) {
  const sub = d.lines.reduce((s, l) => s + (Number(l.q) || 0) * (Number(l.p) || 0), 0);
  const disc = Math.min(Number(d.disc) || 0, sub), ship = Number(d.ship) || 0;
  const base = sub - disc + ship, vat = Math.round(base * (Number(d.vat) || 0)) / 100;
  return { sub, disc, ship, vat, total: base + vat };
}

/* ---------- Editor ---------- */
async function pfOpen(fromOrder) {
  let cfg;
  try { cfg = (await pfLoad()).cfg; } catch (e) { if (e.status !== 401) toast("Could not load the proforma settings. Try again."); return; }
  const o = fromOrder ? ORD.find((x) => x.id === fromOrder) : null;
  const cat = (id) => W.items.find((i) => i.id === id);
  const D = {
    order: o ? o.id : "",
    client: { name: o?.name || "", co: "", phone: o?.phone || "", addr: o?.addr || "" },
    lines: o ? o.items.map((i) => ({ id: i.id, n: i.n, q: i.q, p: i.p || cat(i.id)?.p || 0 })) : [],
    disc: 0, ship: 0, vat: cfg.vat || 0, valid: cfg.valid || 7, note: "",
  };
  const m = document.createElement("div"); m.className = "mod"; m.id = "mod";
  m.innerHTML = `<div class="box pfbox" role="dialog" aria-label="New proforma">
<div class="row"><h2 style="font-size:19px">New proforma${o ? ` <span class="mu sm">from order #${esc(o.id)}</span>` : ""}</h2><span class="sp"></span><button class="btn" data-x>Close</button></div>
<fieldset class="pfs"><legend>Client</legend><div class="g2">
<label class="f">Name<input data-c="name" value="${esc(D.client.name)}" maxlength="80"></label>
<label class="f">Company (optional)<input data-c="co" maxlength="80"></label>
<label class="f">Phone<input data-c="phone" value="${esc(D.client.phone)}" maxlength="30" dir="ltr" inputmode="tel"></label>
<label class="f">Address<input data-c="addr" value="${esc(D.client.addr)}" maxlength="200"></label></div></fieldset>
<fieldset class="pfs"><legend>Items</legend><div class="tw"><table class="pft"><thead><tr><th>Ref</th><th>Description</th><th>Qty</th><th>Unit price $</th><th style="text-align:end">Amount</th><th></th></tr></thead><tbody id="pfl"></tbody></table></div>
<div class="row" style="margin-top:8px"><input id="pfadd" list="pfdl" placeholder="Add a product: type a ref or name" style="flex:1 1 240px"><datalist id="pfdl">${W.items.map((i) => `<option value="${esc(i.id)} · ${esc(i.n)}">`).join("")}</datalist><button class="btn" id="pfblank">+ Custom line</button></div>
<p class="err" id="pfwarn" style="margin:6px 0 0"></p></fieldset>
<div class="g2"><fieldset class="pfs"><legend>Totals</legend><div class="g2">
<label class="f">Discount $<input type="number" min="0" step="0.01" data-d="disc" value="0"></label>
<label class="f">Delivery $<input type="number" min="0" step="0.01" data-d="ship" value="0"></label>
<label class="f">VAT %<input type="number" min="0" max="50" step="0.01" data-d="vat" value="${D.vat}"></label>
<label class="f">Valid for (days)<input type="number" min="1" max="365" step="1" data-d="valid" value="${D.valid}"></label></div></fieldset>
<div class="pfsum" id="pfsum"></div></div>
<label class="f">Note to the client (optional)<textarea data-d="note" rows="2" maxlength="600" placeholder="e.g. Delivery within 2 working days after confirmation."></textarea></label>
<div class="row"><span class="mu sm">Company details, payment and terms come from Settings → Proforma details.</span><span class="sp"></span><button class="btn pri" id="pfgo">Create proforma PDF</button></div>
</div>`;
  document.body.appendChild(m);
  const box = m.querySelector(".box");
  const lines = () => {
    $("pfl").innerHTML = D.lines.map((l, k) => `<tr data-k="${k}"><td><input data-l="id" value="${esc(l.id)}" maxlength="24" style="width:96px" aria-label="Ref"></td><td><input data-l="n" value="${esc(l.n)}" maxlength="160" style="width:100%;min-width:180px" aria-label="Description"></td><td><input class="n" type="number" min="1" step="1" data-l="q" value="${l.q}" style="width:70px" aria-label="Quantity"></td><td><input class="n" type="number" min="0" step="0.01" data-l="p" value="${l.p || ""}" placeholder="0.00" style="width:96px" aria-label="Unit price"></td><td style="text-align:end;white-space:nowrap" data-amt>${money2(l.q * l.p)}</td><td><button class="btn" data-rm aria-label="Remove line">✕</button></td></tr>`).join("")
      || `<tr><td colspan="6" class="mu">No items yet. Add a product below.</td></tr>`;
    sums();
  };
  const sums = () => {
    const s = pfSums(D), miss = D.lines.filter((l) => !(l.p > 0)).length;
    $("pfsum").innerHTML = `<div><span>Subtotal</span><b>${money2(s.sub)}</b></div>${s.disc ? `<div><span>Discount</span><b>−${money2(s.disc)}</b></div>` : ""}${s.ship ? `<div><span>Delivery</span><b>${money2(s.ship)}</b></div>` : ""}${D.vat ? `<div><span>VAT ${D.vat}%</span><b>${money2(s.vat)}</b></div>` : ""}<div class="tot"><span>Total</span><b>${money2(s.total)}</b></div>`;
    $("pfwarn").textContent = miss ? `${miss} ${miss === 1 ? "line has" : "lines have"} no price yet.` : "";
    $("pfl").querySelectorAll("tr[data-k]").forEach((r) => { const l = D.lines[+r.dataset.k]; r.querySelector("[data-amt]").textContent = money2(l.q * l.p); });
  };
  lines();
  box.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.c) D.client[t.dataset.c] = t.value;
    else if (t.dataset.d) { D[t.dataset.d] = t.dataset.d === "note" ? t.value : Math.max(0, +t.value || 0); sums(); }
    else if (t.dataset.l) { const l = D.lines[+t.closest("tr").dataset.k]; l[t.dataset.l] = t.dataset.l === "q" ? Math.max(0, Math.floor(+t.value) || 0) : t.dataset.l === "p" ? Math.max(0, +t.value || 0) : t.value; sums(); }
  });
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-x]")) return m.remove();
    const rm = e.target.closest("[data-rm]"); if (rm) { D.lines.splice(+rm.closest("tr").dataset.k, 1); lines(); }
  });
  const add = () => {
    const v = $("pfadd").value, id = v.split(" · ")[0].trim(), it = W.items.find((i) => i.id === id);
    if (!it) return;
    const have = D.lines.find((l) => l.id === it.id);
    if (have) have.q++; else D.lines.push({ id: it.id, n: it.n, q: 1, p: it.p || 0 });
    $("pfadd").value = ""; lines();
  };
  $("pfadd").addEventListener("change", add);
  $("pfadd").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  $("pfblank").onclick = () => { D.lines.push({ id: "", n: "", q: 1, p: 0 }); lines(); $("pfl").lastElementChild.querySelector("[data-l=n]").focus(); };
  $("pfgo").onclick = async () => {
    D.lines = D.lines.filter((l) => l.q > 0 && (l.n || l.id));
    if (!D.lines.length) { $("pfwarn").textContent = "Add at least one item."; return; }
    D.lines.forEach((l) => { if (!l.n) l.n = l.id; });
    const b = $("pfgo"); b.disabled = true; b.textContent = "Creating…";
    try {
      const r = await api("/api/admin/proforma", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: D }) });
      PF.docs.unshift(r.doc); m.remove(); pfListDraw(); await pfShow(r.doc);
    } catch (e) { if (e.status !== 401) toast("Could not create the proforma. Try again."); b.disabled = false; b.textContent = "Create proforma PDF"; }
  };
}

/* ---------- The A4 document ---------- */
let libs = null;
const loadJs = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
const pfLibs = () => libs || (libs = Promise.all([loadJs("/vendor/html2canvas.min.js"), loadJs("/vendor/jspdf.umd.min.js")]).catch((e) => { libs = null; throw e; }));
const nl = (s) => esc(s).replace(/\n/g, "<br>");
function pfPages(d) {
  const c = { ...(PF && PF.cfg), ...(d.cfg || {}) }, s = pfSums(d), at = new Date(d.at), until = new Date(at.getTime() + d.valid * 864e5);
  const host = document.createElement("div"); host.className = "pfhost"; document.body.appendChild(host);
  const head = (first) => first ? `<header class="ph"><div><img src="/logo.jpg" alt=""><p class="co">${esc(c.co)}</p><p>${esc(c.sub)}</p></div>
<div class="pt"><h1>PROFORMA<br>INVOICE</h1><table><tr><td>No.</td><td><b>${esc(d.no)}</b></td></tr><tr><td>Date</td><td>${dfmt(at)}</td></tr><tr><td>Valid until</td><td>${dfmt(until)}</td></tr>${d.order ? `<tr><td>Order</td><td>#${esc(d.order)}</td></tr>` : ""}</table></div></header>
<div class="pp"><div><h4>From</h4><b>${esc(c.co)}</b>${c.addr ? `<p>${nl(c.addr)}</p>` : ""}${c.tel ? `<p dir="ltr">${esc(c.tel)}</p>` : ""}${c.email ? `<p>${esc(c.email)}</p>` : ""}${c.web ? `<p>${esc(c.web)}</p>` : ""}${c.vatno ? `<p>VAT no. ${esc(c.vatno)}</p>` : ""}</div>
<div><h4>Bill to</h4><b>${esc(d.client.name || "Client")}</b>${d.client.co ? `<p>${esc(d.client.co)}</p>` : ""}${d.client.phone ? `<p dir="ltr">${esc(d.client.phone)}</p>` : ""}${d.client.addr ? `<p>${esc(d.client.addr)}</p>` : ""}</div></div>`
    : `<header class="ph sm"><img src="/logo.jpg" alt=""><p><b>${esc(d.no)}</b> · continued</p></header>`;
  const thead = `<thead><tr><th>#</th><th>Ref</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>`;
  const pages = [];
  const page = (first) => { const p = document.createElement("section"); p.className = "pfp"; p.innerHTML = `<div class="pin">${head(first)}<table class="it">${thead}<tbody></tbody></table><div class="tail"></div></div><footer class="pfo"><span>${esc(c.co)}${c.tel ? " · " + esc(c.tel) : ""}${c.web ? " · " + esc(c.web) : ""}</span><span class="pg"></span></footer>`; host.appendChild(p); pages.push(p); return p; };
  const full = (p) => p.querySelector(".pin").scrollHeight > p.querySelector(".pin").clientHeight;
  let p = page(true);
  d.lines.forEach((l, k) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${k + 1}</td><td class="ref">${esc(l.id)}</td><td>${esc(l.n)}</td><td class="r">${l.q}</td><td class="r">${l.p ? money2(l.p) : "–"}</td><td class="r">${money2(l.q * l.p)}</td>`;
    p.querySelector(".it tbody").appendChild(tr);
    if (full(p) && p.querySelector(".it tbody").children.length > 1) { tr.remove(); p = page(false); p.querySelector(".it tbody").appendChild(tr); }
  });
  const tail = `<div class="sumrow"><div class="words">${d.note ? `<h4>Note</h4><p>${nl(d.note)}</p>` : ""}${c.pay ? `<h4>Payment</h4><p>${nl(c.pay)}</p>` : ""}${c.bank ? `<h4>Bank details</h4><p>${nl(c.bank)}</p>` : ""}</div>
<table class="tot"><tr><td>Subtotal</td><td>${money2(s.sub)}</td></tr>${s.disc ? `<tr><td>Discount</td><td>−${money2(s.disc)}</td></tr>` : ""}${s.ship ? `<tr><td>Delivery</td><td>${money2(s.ship)}</td></tr>` : ""}${d.vat ? `<tr><td>VAT ${d.vat}%</td><td>${money2(s.vat)}</td></tr>` : ""}<tr class="g"><td>Total (USD)</td><td>${money2(s.total)}</td></tr></table></div>
${c.terms ? `<div class="terms"><h4>Terms and conditions</h4><ul>${c.terms.split("\n").filter((x) => x.trim()).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
<p class="fine">This is a proforma invoice, not a tax invoice. Prices are valid until ${dfmt(until)}.</p><div class="sign"><div>Prepared by ${esc(c.co)}</div><div>Client acceptance (name, signature, date)</div></div>`;
  p.querySelector(".tail").innerHTML = tail;
  if (full(p)) { p.querySelector(".tail").innerHTML = ""; p = page(false); p.querySelector(".it").remove(); p.querySelector(".tail").innerHTML = tail; }
  pages.forEach((x, i) => (x.querySelector(".pg").textContent = `Page ${i + 1} of ${pages.length}`));
  return { host, pages };
}
async function pfPdf(d) {
  await pfLibs();
  const { host, pages } = pfPages(d);
  try {
    await document.fonts.ready;
    await Promise.all([...host.querySelectorAll("img")].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    const shots = [];
    for (let i = 0; i < pages.length; i++) {
      const cv = await window.html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff", logging: false });
      const url = cv.toDataURL("image/jpeg", 0.92); shots.push(url);
      if (i) pdf.addPage();
      pdf.addImage(url, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }
    pdf.setProperties({ title: `Proforma ${d.no}`, subject: `Proforma invoice for ${d.client.name || "client"}`, author: (d.cfg && d.cfg.co) || "Oxinab", creator: "Oxinab Command Center" });
    return { blob: pdf.output("blob"), shots };
  } finally { host.remove(); }
}

/* ---------- Preview, download and share ---------- */
async function pfShow(d) {
  const m = document.createElement("div"); m.className = "mod"; m.id = "mod";
  m.innerHTML = `<div class="box pfbox" role="dialog" aria-label="Proforma ${esc(d.no)}"><div class="row"><h2 style="font-size:19px">Proforma ${esc(d.no)}</h2><span class="sp"></span><button class="btn" data-x>Close</button></div><div id="pfprev" class="pfprev"><p class="mu">Making the PDF…</p></div><div class="row" id="pfact"></div><p class="mu sm" id="pfhint" style="margin:0"></p></div>`;
  document.body.appendChild(m);
  m.querySelector("[data-x]").onclick = () => m.remove();
  let out;
  try { out = await pfPdf(d); } catch (e) { $("pfprev").innerHTML = '<p class="err">Could not make the PDF. Check your connection and try again.</p>'; return; }
  $("pfprev").innerHTML = out.shots.map((u, i) => `<img src="${u}" alt="Page ${i + 1}">`).join("");
  const name = `Oxinab-proforma-${d.no}.pdf`, file = new File([out.blob], name, { type: "application/pdf" });
  const url = URL.createObjectURL(out.blob);
  const tel = (d.client.phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "").replace(/^0/, "961");
  const total = money2(pfSums(d).total);
  const msg = `Hello${d.client.name ? " " + d.client.name : ""}, please find attached our proforma ${d.no}${d.order ? " for order #" + d.order : ""}. Total: ${total}. Valid for ${d.valid} days. Thank you, ${(d.cfg && d.cfg.co) || "Oxinab"}.`;
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  $("pfact").innerHTML = `<a class="btn pri" href="${url}" download="${esc(name)}">⬇ Download PDF</a>${canShare ? `<button class="btn pri" id="pfshare">Share PDF (WhatsApp…)</button>` : ""}${tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(tel)}?text=${encodeURIComponent(msg)}">Open WhatsApp chat with client</a>` : ""}<button class="btn" id="pfcopy">Copy message</button>`;
  $("pfhint").textContent = canShare ? "Share sends the PDF straight to WhatsApp or another app on this device." : "On a computer: download the PDF, then open the WhatsApp chat and attach it.";
  if (canShare) $("pfshare").onclick = async () => { try { await navigator.share({ files: [file], title: `Proforma ${d.no}`, text: msg }); } catch (e) {} };
  $("pfcopy").onclick = async () => { try { await navigator.clipboard.writeText(msg); toast("Message copied."); } catch (e) { toast(msg); } };
}

/* ---------- Recent proformas (in the Orders tab) ---------- */
function pfListDraw() {
  const el = $("pflist"); if (!el) return;
  if (!PF) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="panel" style="max-width:none"><h2 style="font-size:18px">Recent proformas</h2>${PF.docs.length ? `<div class="tw"><table><thead><tr><th>No.</th><th>Date</th><th>Client</th><th>Order</th><th style="text-align:end">Total</th><th></th></tr></thead><tbody>${PF.docs.map((d, k) => `<tr><td class="ref">${esc(d.no)}</td><td>${dfmt(new Date(d.at))}</td><td>${esc(d.client.name || "–")}${d.client.co ? ` <small>${esc(d.client.co)}</small>` : ""}</td><td>${d.order ? "#" + esc(d.order) : "–"}</td><td style="text-align:end">${money2(pfSums(d).total)}</td><td><button class="btn" data-pfk="${k}">Open PDF</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="mu" style="margin:0">No proformas yet. Use "Proforma" on an order, or "New proforma".</p>`}</div>`;
}
document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-pf]"); if (a) { pfOpen(a.dataset.pf); return; }
  if (e.target.closest("#pfnew")) { pfOpen(""); return; }
  const k = e.target.closest("[data-pfk]"); if (k) pfShow(PF.docs[+k.dataset.pfk]);
});
async function pfOrdersHook() { try { await pfLoad(); } catch (e) {} pfListDraw(); }

/* ---------- Settings: company details for proformas ---------- */
async function pfSettings() {
  const el = $("pfcfg"); if (!el) return;
  el.innerHTML = '<div class="panel"><p class="mu" style="margin:0">Loading proforma details…</p></div>';
  try { await pfLoad(); } catch (e) { el.innerHTML = '<div class="panel"><p class="err" style="margin:0">Could not load the proforma details.</p></div>'; return; }
  const c = { ...PF.cfg }, f = (k, label, extra = "") => `<label class="f">${label}<input data-k="${k}" value="${esc(c[k])}" ${extra}></label>`;
  el.innerHTML = `<div class="panel"><h2 style="font-size:18px">Proforma details</h2><p class="mu sm" style="margin:0">Printed on every proforma PDF. Saved with the button below (not with Publish changes) and kept private.</p>
<div class="g2">${f("co", "Company name", 'maxlength="80"')}${f("sub", "Line under the name", 'maxlength="120"')}${f("tel", "Phone", 'maxlength="40" dir="ltr"')}${f("email", "Email", 'maxlength="80" type="email"')}${f("web", "Website", 'maxlength="80"')}${f("vatno", "VAT / registration number", 'maxlength="40"')}${f("vat", "Default VAT %", 'type="number" min="0" max="50" step="0.01"')}${f("valid", "Valid for (days)", 'type="number" min="1" max="365" step="1"')}</div>
<label class="f">Address<textarea data-k="addr" rows="2" maxlength="200">${esc(c.addr)}</textarea></label>
${f("pay", "Payment terms", 'maxlength="120"')}
<label class="f">Bank details (optional)<textarea data-k="bank" rows="3" maxlength="600" placeholder="Bank, account name, IBAN / account number">${esc(c.bank)}</textarea></label>
<label class="f">Terms and conditions (one per line)<textarea data-k="terms" rows="4" maxlength="1200">${esc(c.terms)}</textarea></label>
<div class="row"><button class="btn pri" id="pfsave" disabled>Save proforma details</button><span class="mu sm" id="pfmsg"></span></div></div>`;
  el.oninput = (e) => { const k = e.target.dataset.k; if (!k) return; c[k] = e.target.value; $("pfsave").disabled = false; $("pfmsg").textContent = "Not saved yet"; };
  $("pfsave").onclick = async () => {
    $("pfsave").disabled = true;
    try { const r = await api("/api/admin/proforma", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cfg: c }) }); PF.cfg = r.cfg; $("pfmsg").textContent = "Saved."; }
    catch (e) { $("pfsave").disabled = false; if (e.status !== 401) $("pfmsg").textContent = "Could not save. Try again."; }
  };
}
