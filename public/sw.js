/**
 * Winstone CRM offline shell.
 *
 * Small and honest: navigations and static assets are served from a runtime
 * cache when the network is unavailable, so an agent can still open the CRM,
 * see the lead data that was already loaded and write a report. Nothing here
 * pretends a write reached the server — writes go through the local queue in
 * src/lib/offline-queue.ts and only sync when the network is back.
 */
const CACHE = "winstone-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API traffic — stale CRM data must not look live.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match("/"))
            .then(
              (hit) =>
                hit ??
                new Response("অফলাইন — ইন্টারনেট ফিরলে আবার চেষ্টা করুন", {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                }),
            ),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
