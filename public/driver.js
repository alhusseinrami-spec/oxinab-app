/* Oxinab driver app: the driver's deliveries, starting and finishing them, and sharing their location while delivering. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const toast = (m) => { const o = document.createElement("div"); o.className = "toast"; o.textContent = m; document.body.appendChild(o); setTimeout(() => o.remove(), 3500); };
const SN = { new: "New", confirmed: "Confirmed", preparing: "Preparing", out: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };
const intl = (p) => { let d = String(p || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, ""); if (!d.startsWith("961")) d = "961" + d.replace(/^0/, ""); return d; };
let ME = null, JOBS = [], LIVE = false, busy = false;

async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opt });
  let b = {}; try { b = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(b.error || "error"), { status: r.status });
  return b;
}
function showLogin() { ME = null; stopGps(); $("login").hidden = false; $("app").hidden = true; $("out").hidden = true; $("who").textContent = ""; }
async function load() {
  try {
    const r = await api("/api/admin/orders?as=driver");
    if (!r.me) { showLogin(); return; } // signed in to the command center, not as a driver
    ME = r.me; JOBS = r.jobs; LIVE = r.live;
    $("login").hidden = true; $("app").hidden = false; $("out").hidden = false; $("who").textContent = ME.n;
    draw(); gpsSync();
    $("upd").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { if (e.status === 401) showLogin(); else $("upd").textContent = "No connection. Retrying…"; }
}
function draw() {
  const act = JOBS.filter((j) => !["delivered", "cancelled"].includes(j.st)).sort((a, b) => (b.st === "out") - (a.st === "out"));
  const done = JOBS.filter((j) => ["delivered", "cancelled"].includes(j.st));
  $("jobs").innerHTML = (act.length ? act.map(card).join("") : `<div class="empty"><span aria-hidden="true">🛵</span>No deliveries for you right now. New ones appear here by themselves.</div>`)
    + (done.length ? `<h2 style="font-size:16px;margin:18px 0 0" class="mu">Finished today</h2>` + done.map((j) => `<div class="card done-l"><h3>#${esc(j.id)} · ${esc(j.n || "Client")} <span class="pill ${j.st}">${SN[j.st]}</span></h3></div>`).join("") : "");
}
function card(j) {
  const addr = j.addr || "", maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr + ", Lebanon");
  return `<article class="card job"><h3>Order #${esc(j.id)} <span class="pill ${j.st}">${SN[j.st] || j.st}</span></h3>
<p class="who"><b>${esc(j.n || "Client")}</b>${j.tel ? ` · <span dir="ltr">${esc(j.tel)}</span>` : ""}</p>
${addr ? `<div class="addr">📍 ${esc(addr)}</div>` : `<div class="addr mu">No address given. Call the client.</div>`}
${j.note ? `<p class="sm" style="margin:6px 0 0">📝 ${esc(j.note)}</p>` : ""}
<div class="acts">${j.tel ? `<a href="tel:${esc(intl(j.tel).replace(/^/, "+"))}"><span>📞</span>Call</a><a href="https://wa.me/${esc(intl(j.tel))}" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a>` : ""}${addr ? `<a href="${maps}" target="_blank" rel="noopener"><span>🧭</span>Directions</a>` : ""}</div>
<details><summary>Items (${j.items.reduce((a, i) => a + i.q, 0)})</summary><ul>${j.items.map((i) => `<li>${i.q} × ${esc(i.n)}</li>`).join("")}</ul></details>
${j.total != null ? `<div class="cash"><span>Cash to collect</span><span dir="ltr">$${Number(j.total).toFixed(2)}</span></div>` : ""}
${j.st === "out" ? `<button class="big done" data-done="${esc(j.id)}">✓ Delivered</button>` : `<button class="big go" data-go="${esc(j.id)}">🛵 Start delivery</button>`}
</article>`;
}
async function setSt(id, status) {
  if (busy) return; busy = true;
  try { await api("/api/admin/orders?as=driver", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) }); toast(status === "out" ? `Order #${id}: on the way. The client can follow you now.` : `Order #${id} delivered. Thank you!`); }
  catch (e) { if (e.status === 401) { showLogin(); busy = false; return; } toast("Could not update. Check your connection and try again."); }
  busy = false; load();
}
$("jobs").addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]"); if (g) { startGpsNow(); setSt(g.dataset.go, "out"); return; }
  const d = e.target.closest("[data-done]"); if (d && confirm(`Mark order #${d.dataset.done} as delivered?`)) setSt(d.dataset.done, "delivered");
});

/* ----- Location while delivering -----
   Sent every 10 seconds while at least one delivery is out. Phones stop web apps when the screen locks,
   so the screen is kept on while delivering. */
let watch = null, last = null, sentAt = 0, lock = null, timer = null;
const gpsMsg = (cls, txt) => { $("gps").className = "gps " + cls; $("gpst").textContent = txt; };
function startGpsNow() {
  if (watch !== null || !LIVE || !("geolocation" in navigator)) return;
  watch = navigator.geolocation.watchPosition((p) => { last = p; if (Date.now() - sentAt > 9000) send(); },
    (err) => { gpsMsg("warn", err.code === 1 ? "Location is blocked. Allow location for this site in your phone settings so clients can follow you." : "Looking for your location…"); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  clearInterval(timer); timer = setInterval(() => { if (last && Date.now() - sentAt > 9000) send(); }, 10000);
  keepAwake();
}
function stopGps() { if (watch !== null) navigator.geolocation.clearWatch(watch); watch = null; clearInterval(timer); if (lock) { lock.release().catch(() => {}); lock = null; } }
async function send() {
  if (!last) return; sentAt = Date.now();
  const c = last.coords;
  try {
    await api("/api/admin/orders", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, hd: c.heading, sp: c.speed }) });
    gpsMsg("on", `Sharing your location with your clients · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
  } catch (e) { if (e.status === 401) showLogin(); else gpsMsg("warn", "Could not send your location. Check your connection."); }
}
async function keepAwake() { try { if ("wakeLock" in navigator && !lock && !document.hidden) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => (lock = null)); } } catch (e) {} }
function gpsSync() {
  const out = JOBS.some((j) => j.st === "out");
  if (!LIVE) { gpsMsg("", out ? "Clients see your progress steps. The live map is not switched on yet." : "Clients see each step you mark."); stopGps(); return; }
  if (out) { startGpsNow(); if ($("gps").className.indexOf("on") < 0 && $("gps").className.indexOf("warn") < 0) gpsMsg("", "Starting location…"); }
  else { stopGps(); gpsMsg("", "Location is off. It turns on when you start a delivery."); }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && ME) { load(); if (watch !== null) keepAwake(); } });

/* ----- Sign in and out ----- */
$("lf").addEventListener("submit", async (e) => {
  e.preventDefault(); $("lerr").textContent = "";
  try { await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ driver: $("lp").value, pin: $("lpin").value }) }); $("lpin").value = ""; load(); }
  catch (err) { $("lerr").textContent = err.status === 429 ? "Too many tries. Wait 15 minutes and try again." : err.status === 401 ? "Wrong phone number or PIN." : "Could not connect. Try again."; }
});
$("out").onclick = async () => { if (JOBS.some((j) => j.st === "out") && !confirm("You have a delivery on the way. Sign out anyway?")) return; try { await fetch("/api/admin/login", { method: "DELETE" }); } catch (e) {} showLogin(); };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
load(); setInterval(() => { if (ME && !document.hidden) load(); }, 30000);
