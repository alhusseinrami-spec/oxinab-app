/* Oxinab catalogue: compare a pro-forma from another supplier with Oxinab's prices.
   The client uploads a PDF, a photo, or an Excel/CSV file. The server keeps a copy for Oxinab, reads the items,
   matches them to the catalogue and says where Oxinab is cheaper. From the report the client adds all the cheaper
   items to the order at once or picks them one by one, then sends them on WhatsApp to check availability.
   Uses helpers from app.js: t, TR, LANG, esc, money, byId, CATS, nm, cart, ch, openCart, drawCart, who, toast, WA, SHOW_PRICES. */
Object.assign(TR, {
  "Compare a pro-forma": "قارن عرض سعر", "Compare prices": "قارن الأسعار",
  "Got a pro-forma from another supplier?": "لديك عرض سعر من مورّد آخر؟",
  "Upload it and see which items are cheaper at Oxinab. Add them to your order in one tap.": "حمّله واعرف أي المنتجات أرخص لدى أوكسيناب، وأضفها إلى طلبك بضغطة واحدة.",
  "Upload a pro-forma or price list": "حمّل عرض السعر أو لائحة الأسعار",
  "PDF, photo, Excel (.xlsx) or CSV, up to 4 MB.": "PDF أو صورة أو Excel (.xlsx) أو CSV، حتى 4 ميغابايت.",
  "Choose a file": "اختر ملفاً", "Take a photo": "التقط صورة",
  "We match each item with our catalogue and show you where Oxinab is cheaper. Oxinab keeps a copy of the file you upload.": "نطابق كل منتج مع الكتالوج ونريك أين أوكسيناب أرخص. تحتفظ أوكسيناب بنسخة من الملف الذي تحمّله.",
  "Reading your pro-forma…": "نقرأ عرض السعر…", "This can take up to a minute.": "قد يستغرق ذلك حتى دقيقة.",
  "items read": "منتجات مقروءة", "found at Oxinab": "متوفرة لدى أوكسيناب", "cheaper at Oxinab": "أرخص لدى أوكسيناب",
  "You save": "توفّر", "Cheaper at Oxinab": "أرخص لدى أوكسيناب", "Their price": "سعرهم", "Our price": "سعرنا", "Qty": "الكمية",
  "Similar item, check the size or brand": "منتج مشابه، تحقّق من الحجم أو العلامة", "Select all": "تحديد الكل",
  "Add all cheaper items to my order": "أضف كل المنتجات الأرخص إلى طلبي", "Add selected to my order": "أضف المحدد إلى طلبي",
  "Check availability on WhatsApp": "تحقّق من التوفر عبر واتساب", "Open my order": "افتح طلبي",
  "Added to your order": "أضيفت إلى طلبك", "Ask us for a price": "اطلب السعر منا", "Not cheaper at Oxinab": "ليست أرخص لدى أوكسيناب",
  "Not in our catalogue": "غير موجودة في الكتالوج", "No price on their pro-forma": "بلا سعر في عرضهم", "Ask about these on WhatsApp": "اسأل عنها عبر واتساب",
  "Compare another file": "قارن ملفاً آخر", "Comparison": "مقارنة", "from": "من",
  "None of the items are cheaper at Oxinab right now. Message us on WhatsApp and we will see what we can do.": "لا توجد منتجات أرخص لدى أوكسيناب حالياً. راسلنا عبر واتساب وسنرى ما يمكننا فعله.",
  "We could not read this file. Try a clearer PDF or photo, or an Excel file.": "تعذّرت قراءة هذا الملف. جرّب ملف PDF أو صورة أوضح، أو ملف Excel.",
  "This is an old Excel file (.xls). Save it as .xlsx or PDF and try again.": "هذا ملف Excel قديم (.xls). احفظه بصيغة .xlsx أو PDF وحاول مجدداً.",
  "We received your file. Send it to us on WhatsApp and we will compare the prices for you.": "استلمنا ملفك. أرسله لنا عبر واتساب وسنقارن الأسعار لك.",
  "This file type is not supported. Use PDF, a photo, Excel (.xlsx) or CSV.": "نوع الملف غير مدعوم. استخدم PDF أو صورة أو Excel (.xlsx) أو CSV.",
  "The file is too large. The limit is 4 MB.": "الملف كبير جداً. الحد الأقصى 4 ميغابايت.",
  "Too many files. Please wait a little and try again.": "ملفات كثيرة. انتظر قليلاً وحاول مجدداً.",
  "Message us on WhatsApp": "راسلنا عبر واتساب", "Out of stock": "غير متوفر", "Prices are compared per unit, before VAT. Oxinab prices are confirmed when you order.": "تُقارن الأسعار للقطعة الواحدة قبل الضريبة. تُؤكَّد أسعار أوكسيناب عند الطلب.",
  "Price in": "السعر بعملة", "is not compared": "غير مُقارن",
});
let CMP = null, CMPSEL = new Set(), CMPST = "pick", CMPERR = "", CMPN = "";
const cmpLoad = () => { try { CMPN = localStorage.getItem("oxcn") || ""; } catch (e) {} };
cmpLoad();
const cmpNote = () => CMPN ? (LANG === "ar" ? "مقارنة عرض سعر رقم " : "Pro-forma comparison #") + CMPN : "";
function cmpSetNote(id) { CMPN = id || ""; try { id ? localStorage.setItem("oxcn", id) : localStorage.removeItem("oxcn"); } catch (e) {} }

function cmpOpen() {
  const el = $("cmp"); el.hidden = false; document.body.style.overflow = "hidden"; cmpDraw();
  if (location.hash !== "#compare") history.pushState(null, "", "#compare");
}
function cmpClose() { const el = $("cmp"); if (el.hidden) return; el.hidden = true; document.body.style.overflow = ""; if (location.hash === "#compare") history.back(); }
addEventListener("popstate", () => { if (location.hash !== "#compare" && !$("cmp").hidden) { $("cmp").hidden = true; document.body.style.overflow = ""; } });

const cur$ = (v, c) => (c === "USD" || !c ? money(v) : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + c);
const qfmt = (q) => (Number.isInteger(q) ? q : +q.toFixed(3));
function cmpRow(l, i, pick) {
  const p = byId[l.m], c = p ? CATS[p.ci] : null, sv = l.op && l.pu ? Math.round((1 - l.op / l.pu) * 100) : 0;
  return `<li class="cr${pick ? "" : " np"}" style="--c:${c ? c.c : "var(--pr)"}">
${pick ? `<label class="cr-ck"><input type="checkbox" data-i="${i}" ${CMPSEL.has(i) ? "checked" : ""} aria-label="${esc(p ? nm(p) : l.n)}"></label>` : ""}
<span class="cr-th">${p && p.im ? `<img src="${esc(p.im)}" alt="" loading="lazy">` : `<span aria-hidden="true">${c ? c.e : "📄"}</span>`}</span>
<div class="cr-b">${p ? `<b>${esc(nm(p))}</b><span class="mu sm"><span dir="ltr">${esc(p.id)}</span> · ${t("from")} <span dir="auto">${esc(l.n)}</span></span>` : `<b dir="auto">${esc(l.n)}</b>${l.code ? `<span class="mu sm" dir="ltr">${esc(l.code)}</span>` : ""}`}
${l.fit === "similar" ? `<span class="cr-sim">${t("Similar item, check the size or brand")}</span>` : ""}${p && out(p) ? `<span class="sb out">${t("Out of stock")}</span>` : ""}
${l.pu == null && l.p ? `<span class="mu sm">${t("Price in")} ${esc(l.cur)} ${t("is not compared")}</span>` : ""}</div>
<div class="cr-p"><span class="mu sm">${t("Qty")} <b dir="ltr">${qfmt(l.q)}</b></span>${l.p ? `<s dir="ltr" title="${t("Their price")}">${cur$(l.p, l.cur)}</s>` : ""}${l.op ? `<b dir="ltr" title="${t("Our price")}">${money(l.op)}</b>` : ""}${sv > 0 ? `<em>−⁦${sv}%⁩</em>` : ""}</div></li>`;
}
function cmpDraw() {
  const el = $("cmp"); if (el.hidden) return;
  let body = "";
  if (CMPST === "pick") {
    body = `<div class="cmp-up"><span class="cmp-ic" aria-hidden="true">🧾</span><h3>${t("Upload a pro-forma or price list")}</h3><p class="mu sm">${t("PDF, photo, Excel (.xlsx) or CSV, up to 4 MB.")}</p>
<div class="cmp-bt"><label class="cbtn">📎 ${t("Choose a file")}<input type="file" id="cmpf" accept=".pdf,.xlsx,.xls,.csv,application/pdf,image/*" hidden></label><label class="cbtn alt">📷 ${t("Take a photo")}<input type="file" id="cmpc" accept="image/*" capture="environment" hidden></label></div>
<p class="mu sm" style="margin:14px 0 0">${t("We match each item with our catalogue and show you where Oxinab is cheaper. Oxinab keeps a copy of the file you upload.")}</p>
${CMPERR ? `<p class="cmp-err" role="alert">${t(CMPERR)}</p>${CMPERR.startsWith("We received") ? `<a class="btn" href="${waLink(cmpNote())}" target="_blank" rel="noopener">${t("Message us on WhatsApp")}</a>` : ""}` : ""}</div>`;
  } else if (CMPST === "busy") {
    body = `<div class="cmp-up"><span class="cmp-spin" aria-hidden="true"></span><h3>${t("Reading your pro-forma…")}</h3><p class="mu sm">${t("This can take up to a minute.")}</p></div>`;
  } else {
    const L = CMP.lines, s = CMP.stats, idx = (st) => L.map((l, i) => [l, i]).filter(([l]) => l.st === st);
    const chp = idx("cheaper"), np = idx("noprice").concat(idx("nocur")), mo = idx("more"), un = idx("unpriced"), no = idx("none");
    const save = CMP.prices && s.theirs ? s.theirs - s.ours : 0;
    body = `<div class="tc cmp-s"><div class="tc-h"><div><h3>${t("Comparison")} <span dir="ltr">#${esc(CMP.id)}</span></h3>${CMP.sup ? `<span class="mu" dir="auto">${esc(CMP.sup)}${CMP.docno ? " · " + esc(CMP.docno) : ""}</span>` : ""}</div></div>
<div class="cmp-n"><div><b>${s.items}</b><span>${t("items read")}</span></div><div><b>${s.matched}</b><span>${t("found at Oxinab")}</span></div><div class="g"><b>${s.cheaper}</b><span>${t("cheaper at Oxinab")}</span></div>${save > 0 ? `<div class="g"><b dir="ltr">${money(save)}</b><span>${t("You save")} ⁦${Math.round(save / s.theirs * 100)}%⁩</span></div>` : ""}</div></div>`
      + (chp.length ? `<div class="cmp-g"><div class="cmp-gh"><h3>${t("Cheaper at Oxinab")}</h3><label class="mu sm"><input type="checkbox" id="cmpall" ${chp.every(([, i]) => CMPSEL.has(i)) ? "checked" : ""}> ${t("Select all")}</label></div><ul class="cl">${chp.map(([l, i]) => cmpRow(l, i, true)).join("")}</ul></div>`
        : `<div class="tc"><p style="margin:0">${t("None of the items are cheaper at Oxinab right now. Message us on WhatsApp and we will see what we can do.")}</p></div>`)
      + (np.length ? `<details class="cmp-g" open><summary><h3>${t("Ask us for a price")} (${np.length})</h3></summary><ul class="cl">${np.map(([l, i]) => cmpRow(l, i, true)).join("")}</ul></details>` : "")
      + (un.length ? `<details class="cmp-g" open><summary><h3>${t("No price on their pro-forma")} (${un.length})</h3></summary><ul class="cl">${un.map(([l, i]) => cmpRow(l, i, true)).join("")}</ul></details>` : "")
      + (mo.length ? `<details class="cmp-g"><summary><h3>${t("Not cheaper at Oxinab")} (${mo.length})</h3></summary><ul class="cl">${mo.map(([l, i]) => cmpRow(l, i, true)).join("")}</ul></details>` : "")
      + (no.length ? `<details class="cmp-g"><summary><h3>${t("Not in our catalogue")} (${no.length})</h3></summary><ul class="cl">${no.map(([l, i]) => cmpRow(l, i, false)).join("")}</ul><a class="cmp-wa2" href="${waLink(cmpMsg(no.map(([l]) => l), true))}" target="_blank" rel="noopener">💬 ${t("Ask about these on WhatsApp")}</a></details>` : "")
      + `<p class="mu sm">${t("Prices are compared per unit, before VAT. Oxinab prices are confirmed when you order.")}</p><button class="cmp-again" id="cmpre">↺ ${t("Compare another file")}</button>`;
    // Out-of-stock items can't go in the basket but can still be asked about on WhatsApp.
    const sel = [...CMPSEL].sort((a, b) => a - b).filter((i) => L[i] && L[i].m), n = sel.filter((i) => byId[L[i].m] && !out(byId[L[i].m])).length;
    body += `<div class="cmp-bar"><button class="cbtn" id="cmpadd" ${n ? "" : "disabled"}>${chp.length && chp.every(([, i]) => CMPSEL.has(i)) && n === chp.length ? t("Add all cheaper items to my order") : t("Add selected to my order")} (${n})</button><a class="cbtn wa${sel.length ? "" : " off"}" id="cmpwa" href="${sel.length ? waLink(cmpMsg(sel.map((i) => L[i]))) : "#"}" target="_blank" rel="noopener">💬 ${t("Check availability on WhatsApp")}</a></div>`;
  }
  el.innerHTML = `<div class="trk-h"><div class="wrap"><button id="cmpx" aria-label="${t("Back")}">${LANG === "ar" ? "→" : "←"}</button><h2 id="cmpt">${t("Compare prices")}</h2></div></div><div class="wrap">${body}</div>`;
}
const waLink = (msg) => "https://wa.me/" + WA + "?text=" + encodeURIComponent(msg);
// The WhatsApp message: the chosen items with the competitor's price, so Oxinab can check stock and confirm.
function cmpMsg(lines, unknown) {
  const ar = LANG === "ar", head = (ar ? "مرحباً أوكسيناب، " : "Hello Oxinab, ") + (unknown
    ? (ar ? "هل تتوفر لديكم هذه المنتجات من عرض سعر آخر؟" : "do you have these items from another supplier's pro-forma?")
    : (ar ? "قارنت عرض سعر وأود التحقق من توفر هذه المنتجات:" : "I compared a pro-forma and would like to check availability of these items:"));
  const ln = lines.map((l) => {
    const p = byId[l.m], q = qfmt(l.q);
    return p ? `• ${p.id} - ${ar ? p.a || p.n : p.n} × ${q}${l.op ? " (" + money(l.op) + ")" : ""}${l.p ? (ar ? " | سعرهم " : " | their price ") + cur$(l.p, l.cur) : ""}`
      : `• ${l.n}${l.code ? " [" + l.code + "]" : ""} × ${q}${l.p ? (ar ? " | سعرهم " : " | their price ") + cur$(l.p, l.cur) : ""}`;
  });
  return head + "\n" + ln.join("\n") + "\n" + (ar ? "مقارنة رقم " : "Comparison #") + CMP.id;
}

/* Photos are made smaller on the phone before sending (long side 2000 px). */
function shrink(file) {
  return new Promise((ok) => {
    if (!/^image\/(jpeg|png|webp|heic|heif)/.test(file.type) || file.size < 900_000) return ok(file);
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, 2000 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => ok(b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file), "image/jpeg", 0.85); };
    im.onerror = () => { URL.revokeObjectURL(u); ok(file); };
    im.src = u;
  });
}
async function cmpSend(file) {
  if (!file) return;
  CMPERR = "";
  file = await shrink(file);
  if (file.size > 4_200_000) { CMPERR = "The file is too large. The limit is 4 MB."; return cmpDraw(); }
  CMPST = "busy"; cmpDraw();
  const u = who();
  try {
    const r = await fetch("/api/compare", { method: "POST", body: file, headers: { "content-type": file.type || "application/octet-stream", "x-file": encodeURIComponent(file.name || "file"), "x-lang": LANG, "x-who": encodeURIComponent(JSON.stringify({ name: u.name, phone: u.phone })) } });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      CMP = j; CMPST = "done"; cmpSetNote(j.id);
      CMPSEL = new Set(j.lines.map((l, i) => [l, i]).filter(([l]) => l.st === "cheaper").map(([, i]) => i));
    } else {
      CMPST = "pick";
      if (j.id) cmpSetNote(j.id);
      CMPERR = j.error === "old_excel" ? "This is an old Excel file (.xls). Save it as .xlsx or PDF and try again."
        : j.error === "needs_ai" ? "We received your file. Send it to us on WhatsApp and we will compare the prices for you."
        : j.error === "type" ? "This file type is not supported. Use PDF, a photo, Excel (.xlsx) or CSV."
        : j.error === "too_large" ? "The file is too large. The limit is 4 MB."
        : r.status === 429 ? "Too many files. Please wait a little and try again."
        : "We could not read this file. Try a clearer PDF or photo, or an Excel file.";
    }
  } catch (e) { CMPST = "pick"; CMPERR = "Could not connect. Check your internet."; }
  cmpDraw(); $("cmp").scrollTop = 0;
}
function cmpAdd() {
  const L = CMP.lines; let n = 0;
  [...CMPSEL].forEach((i) => { const l = L[i], p = l && byId[l.m]; if (!p || out(p)) return; const want = Math.max(1, Math.ceil(l.q)), have = cart[p.id] || 0; if (want > have) ch(p.id, want - have); n++; });
  drawCart();
  toast(t("Added to your order") + ": ⁦" + n + "⁩");
  const b = $("cmpadd"); if (b) { b.textContent = t("Open my order"); b.disabled = false; b.dataset.open = "1"; }
}
$("cmp").addEventListener("click", (e) => {
  if (e.target.closest("#cmpx")) return cmpClose();
  if (e.target.closest("#cmpre")) { CMPST = "pick"; CMP = null; CMPERR = ""; return cmpDraw(); }
  const a = e.target.closest("#cmpadd");
  if (a) { if (a.dataset.open) { cmpClose(); setTimeout(() => openCart(true), 50); } else cmpAdd(); return; }
  const w = e.target.closest("#cmpwa"); if (w && w.classList.contains("off")) e.preventDefault();
});
$("cmp").addEventListener("change", (e) => {
  const x = e.target;
  if (x.id === "cmpf" || x.id === "cmpc") return cmpSend(x.files && x.files[0]);
  if (x.id === "cmpall") { CMP.lines.forEach((l, i) => { if (l.st === "cheaper") x.checked ? CMPSEL.add(i) : CMPSEL.delete(i); }); return cmpDraw(); }
  if (x.dataset.i != null) { const i = +x.dataset.i; x.checked ? CMPSEL.add(i) : CMPSEL.delete(i); const y = $("cmp").scrollTop; cmpDraw(); $("cmp").scrollTop = y; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cmpClose(); });
document.querySelectorAll("[data-cmp]").forEach((b) => (b.onclick = cmpOpen));
if (location.hash === "#compare") setTimeout(cmpOpen, 0);
// The deals and compare words are added after app.js first translates the page, so translate it again now.
stat();
