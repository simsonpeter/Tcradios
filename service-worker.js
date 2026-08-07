/* Internet Radio service worker — caches app shell only, never audio streams. */
const CACHE_VERSION = "internet-radio-shell-v1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const PLAYLIST_HOST = "raw.githubusercontent.com";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("Shell precache failed:", err);
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isAudioRequest(request, url) {
  const dest = request.destination;
  if (dest === "audio" || dest === "video") return true;
  if (/\.(mp3|aac|m4a|ogg|opus|wav)(\?|$)/i.test(url.pathname)) return true;
  // Common radio streaming paths / hosts should bypass cache
  if (/stream|listen|icecast|shoutcast|radio/i.test(url.href)) {
    if (url.hostname !== self.location.hostname) return true;
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache playlist fetches — always network when online
  if (url.hostname === PLAYLIST_HOST || url.pathname.endsWith("stations.json")) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cached = await caches.match(request);
          return (
            cached ||
            new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          );
        })
    );
    return;
  }

  // Never cache radio audio streams
  if (isAudioRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  // App shell: network-first for navigations, cache-first for static assets
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          // Only cache same-origin static shell files
          if (url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
