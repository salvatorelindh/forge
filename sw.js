// Offline cache. Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'forge-v22';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'figure.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages says files are fresh for 10 min)
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Network-first so updates show up straight away; fall back to the offline copy (gym basement, no signal).
  // 'no-cache' asks the server whether the file changed instead of trusting the 10-minute HTTP cache;
  // unchanged files come back as a tiny "not modified" reply, so this costs almost nothing.
  e.respondWith((async () => {
    try {
      let r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
      if (r.redirected) r = new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });  // Safari rejects redirected pages from a service worker
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    } catch (err) {
      return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('./') : Response.error());
    }
  })());
});
