// Service Report vNext — minimal service worker for offline app-shell support.
//
// Strategy: stale-while-revalidate for same-origin GET requests of static
// assets (script / style / document / image). API calls (anything to
// supabase.co or starting with /api or /rest) always go network-first and
// are never cached. This keeps the wizard reachable after the first online
// load without serving stale data for mutations.

// Bump on every release that ships changes to index.html / manifest /
// other shell assets — the activate handler nukes older caches so users
// don't get stuck on a stale app shell.
const CACHE_NAME = "fcc-shell-v10-pwa";
const STATIC_DESTINATIONS = new Set(["document", "script", "style", "image", "font"]);

self.addEventListener("install", (event) => {
  // Activate immediately so subsequent visits get the new SW.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API or Supabase traffic.
  const isApi =
    url.hostname.endsWith("supabase.co") ||
    url.hostname.endsWith("supabase.in") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/");
  if (isApi) return;

  // Only cache same-origin static destinations.
  if (url.origin !== self.location.origin) return;
  if (!STATIC_DESTINATIONS.has(req.destination)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Stale-while-revalidate: serve cache immediately, refresh in background.
        networkFetch.catch(() => {});
        return cached;
      }
      const fresh = await networkFetch;
      if (fresh) return fresh;
      // Last resort: re-look-up cache (race condition) or fail.
      const fallback = await cache.match(req);
      return fallback ?? new Response("Offline", { status: 503 });
    })(),
  );
});
