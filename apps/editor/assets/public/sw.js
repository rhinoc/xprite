const CACHE_NAME = "xprite-v5";
const BASE_URL = new URL("./", self.location.href);
const APP_SHELL = [
  BASE_URL.href,
  new URL("manifest.webmanifest?v=xprite-3", BASE_URL).href,
  new URL("icon-192.png?v=xprite-3", BASE_URL).href,
  new URL("icon-512.png?v=xprite-3", BASE_URL).href,
  new URL("icon.svg?v=xprite-3", BASE_URL).href,
  new URL("favicon.ico?v=xprite-2", BASE_URL).href,
  new URL("favicon-16.png?v=xprite-2", BASE_URL).href,
  new URL("favicon-32.png?v=xprite-2", BASE_URL).href,
  new URL("startup-loading.webp?v=xprite-2", BASE_URL).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match(BASE_URL.href)) ||
            new Response("Offline", { status: 503, statusText: "Offline" }),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
