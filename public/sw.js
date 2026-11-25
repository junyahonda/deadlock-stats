// Replaced with build-specific, content-hashed values by vite.config.js.
const VERSION = "__BUILD_VERSION__";
const PRECACHE = [];
const PREFIX = `deadlock-stats:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const shell = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    PRECACHE.map((path) => new URL(path, self.registration.scope).href),
  )));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Never cache the external stats API or interfere with the main website.
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(shell, response.clone())).catch(() => {}));
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(shell, { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }
  // Only immutable, content-hashed assets are cache-first. Manifest and icons
  // remain fresh on deploy; old clients keep their version until tabs close.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Precache fetches and module/font requests have different Origin headers.
    // Preview hosts can send Vary: Origin even for identical public files.
    // These are same-origin static files only, never API or personalized data.
    const cached = await cache.match(request, { ignoreVary: true });
    if (new URL(request.url).pathname.includes("/assets/") && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch { /* Storage full: use the network response. */ }
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
