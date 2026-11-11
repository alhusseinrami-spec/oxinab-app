/* Oxinab service worker: makes the catalogue installable and usable offline, and shows offer notifications. */
const V = "oxinab-v11";
const SHELL = ["/", "/styles.css", "/app.js", "/logo.jpg", "/catalog.json", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== V + "-img").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === location.origin && (u.pathname.startsWith("/api/") || u.pathname.startsWith("/admin"))) return;
  const isImg = r.destination === "image";
  if (isImg) {
    // Photos: from the phone first, then the network.
    e.respondWith(caches.open(V + "-img").then(async (c) => {
      const hit = await c.match(r);
      if (hit) return hit;
      const res = await fetch(r);
      if (res.ok || res.type === "opaque") c.put(r, res.clone());
      return res;
    }).catch(() => fetch(r)));
    return;
  }
  if (u.origin !== location.origin) return;
  // Pages, styles and scripts: network first so updates show, saved copy when offline.
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then((m) => m || caches.match("/"))));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Oxinab", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Oxinab", {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: d.url || "/" }, tag: "oxinab-offer", renotify: true,
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || "/";
  if (!url.startsWith("/") || url.startsWith("//")) url = "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if (new URL(c.url).origin === location.origin && "focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
