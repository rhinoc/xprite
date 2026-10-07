// Replaced by editorOffline() with the complete output graph for this release.
const OFFLINE_BUILD = null;
const CACHE_PREFIX = "xprite-editor-";
const VERSION = OFFLINE_BUILD?.version ?? "unbuilt";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const BASE_URL = new URL("./", self.location.href);
const READY_URL = new URL("__xprite_offline_ready__", BASE_URL).href;
const EDITOR_PATHS = new Set(["/", "/home", "/home/", "/editor", "/editor/"]);
const IMMUTABLE_ASSET_PATH = /^\/assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
const MESSAGE_STATUS = "XPRITE_OFFLINE_STATUS";
const MESSAGE_PREPARE = "XPRITE_OFFLINE_PREPARE";
const entries = (OFFLINE_BUILD?.entries ?? []).map((entry) => ({
  ...entry,
  url: new URL(entry.url, BASE_URL).href,
}));
const entriesByPath = new Map(entries.map((entry) => [new URL(entry.url).pathname, entry]));
const shellUrl = OFFLINE_BUILD ? new URL(OFFLINE_BUILD.shell, BASE_URL).href : null;

async function isOfflineReady() {
  if (!entries.length) return false;
  const cache = await caches.open(CACHE_NAME);
  const marker = await cache.match(READY_URL);
  if (!marker || (await marker.text()) !== VERSION) return false;
  const resources = await Promise.all(entries.map((entry) => cache.match(entry.url)));
  return resources.every(Boolean);
}

function resourceRequest(entry) {
  return new Request(entry.url, {
    cache: "reload",
    credentials: "same-origin",
    integrity: entry.integrity,
  });
}

async function prepareOfflineCache() {
  if (!entries.length) throw new Error("Missing editor offline build manifest");
  const cache = await caches.open(CACHE_NAME);
  const cached = await Promise.all(entries.map((entry) => cache.match(entry.url)));
  const missing = entries.filter((_, index) => !cached[index]);
  // addAll commits the resource set atomically; SRI rejects mixed releases.
  if (missing.length) await cache.addAll(missing.map(resourceRequest));
  await cache.put(READY_URL, new Response(VERSION));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!entries.length) throw new Error("Missing editor offline build manifest");
      try {
        if (!(await isOfflineReady())) await prepareOfflineCache();
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
      // Claim the completed release silently. Open pages keep running their loaded code;
      // the new shell is used only on their next navigation or manual refresh.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // An open page may still need its old lazy chunks or workers. Reclaim old caches
      // only during an activation with no editor windows, rather than guessing versions.
      if (!clients.some(isEditorWindow)) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      }
      await self.clients.claim();
    })(),
  );
});

function isEditorWindow(client) {
  const url = new URL(client.url);
  return url.origin === self.location.origin && EDITOR_PATHS.has(url.pathname);
}

function reply(event, message) {
  if (event.ports[0]) event.ports[0].postMessage(message);
  else event.source?.postMessage(message);
}

function offlineStatus(ready) {
  return { type: MESSAGE_STATUS, ready, version: VERSION, shell: OFFLINE_BUILD?.shell ?? null };
}

self.addEventListener("message", (event) => {
  if (event.data?.type === MESSAGE_PREPARE) {
    event.waitUntil(
      prepareOfflineCache()
        .then(isOfflineReady)
        .catch(() => false)
        .then((ready) => reply(event, offlineStatus(ready))),
    );
    return;
  }
  if (event.data?.type === MESSAGE_STATUS) {
    event.waitUntil(
      isOfflineReady()
        .catch(() => false)
        .then((ready) => reply(event, offlineStatus(ready))),
    );
    return;
  }
});

function cachedResource(event, entry) {
  const cachePromise = caches.open(CACHE_NAME);
  const resourcePromise = cachePromise.then(async (cache) => {
    const cached = await cache.match(entry.url);
    if (cached) return { response: cached, cacheCopy: null };
    const response = await fetch(resourceRequest(entry));
    if (!response.ok) throw new Error("Editor offline resource unavailable");
    return { response, cacheCopy: response.clone() };
  });
  event.waitUntil(
    Promise.all([cachePromise, resourcePromise])
      .then(async ([cache, resource]) => {
        if (resource.cacheCopy) await cache.put(entry.url, resource.cacheCopy);
      })
      .catch(() => {}),
  );
  return resourcePromise.then((resource) => resource.response);
}

async function previousImmutableResource(request, url) {
  const names = await caches.keys();
  const resourceUrl = new URL(url.pathname, BASE_URL).href;
  for (const name of names) {
    if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
    const cache = await caches.open(name);
    const response = await cache.match(resourceUrl);
    if (response) return response;
  }
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (!EDITOR_PATHS.has(url.pathname) || !shellUrl) return;
    const shell = entriesByPath.get(new URL(shellUrl).pathname);
    if (!shell) return;
    // Pin HTML to this worker's release, including when the network has a newer build.
    event.respondWith(
      cachedResource(event, shell).catch(
        () => new Response("Offline", { status: 503, statusText: "Offline" }),
      ),
    );
    return;
  }

  // Only editor build resources are cached; APIs, telemetry and public pages stay untouched.
  const entry = entriesByPath.get(url.pathname);
  if (entry) event.respondWith(cachedResource(event, entry));
  // After a background update, an open page may still load its own chunks or workers.
  // Content-hashed URLs retain the same bytes; never use old HTML or mutable resources.
  else if (IMMUTABLE_ASSET_PATH.test(url.pathname))
    event.respondWith(previousImmutableResource(request, url));
});
