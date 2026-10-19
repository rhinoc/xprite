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
const MESSAGE_HAS_RESOURCE = "XPRITE_OFFLINE_HAS_RESOURCE";
const MESSAGE_FETCH_FAILED = "XPRITE_OFFLINE_FETCH_FAILED";
const INSTALLED_URL = new URL("__xprite_offline_installed__", BASE_URL).href;
// Open tabs and restored mobile tabs keep running the release they loaded. Their lazy chunks
// stay available from this many previous releases; older caches are pruned on activation.
const RETAINED_PREVIOUS_RELEASES = 2;
// A slower network falls back to the installed shell so offline and flaky starts stay fast.
const NAVIGATION_TIMEOUT_MS = 3000;
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
  // Install time orders releases when old caches are retained or pruned.
  if (!(await cache.match(INSTALLED_URL)))
    await cache.put(INSTALLED_URL, new Response(String(Date.now())));
  await cache.put(READY_URL, new Response(VERSION));
}

async function installedAt(name) {
  try {
    const cache = await caches.open(name);
    const marker = await cache.match(INSTALLED_URL);
    const time = marker ? Number(await marker.text()) : 0;
    return Number.isFinite(time) ? time : 0;
  } catch {
    return 0;
  }
}

async function pruneOldReleases() {
  const names = (await caches.keys()).filter(
    (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
  );
  const dated = await Promise.all(
    names.map(async (name) => ({ name, time: await installedAt(name) })),
  );
  dated.sort((left, right) => right.time - left.time);
  await Promise.all(
    dated.slice(RETAINED_PREVIOUS_RELEASES).map((entry) => caches.delete(entry.name)),
  );
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
      // Pages that loaded an earlier release may still request its lazy chunks or workers, and
      // a discarded mobile tab is not listed as a client. Retain the newest previous releases
      // whether or not an editor window is open, and prune only the older ones.
      try {
        await pruneOldReleases();
      } catch {
        // Cache housekeeping must not block taking control.
      }
      await self.clients.claim();
    })(),
  );
});

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
  if (event.data?.type === MESSAGE_HAS_RESOURCE) {
    let present = false;
    try {
      present = entriesByPath.has(new URL(String(event.data.url), self.location.href).pathname);
    } catch {
      // An unreadable URL is simply not part of this release.
    }
    reply(event, { type: MESSAGE_HAS_RESOURCE, present, version: VERSION });
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

function failureKind(error) {
  return /integrity|digest/i.test(String(error?.message ?? error)) ? "integrity" : "network";
}

/** Tells the requesting page why a build resource failed; the worker cannot report on its own. */
async function reportResourceFailure(event, entry, failure, status) {
  try {
    const clientId = event.clientId || event.resultingClientId;
    const client = clientId ? await self.clients.get(clientId) : null;
    client?.postMessage({
      type: MESSAGE_FETCH_FAILED,
      path: new URL(entry.url).pathname,
      failure,
      status: status ?? null,
      version: VERSION,
    });
  } catch {
    // Diagnostics must not change the response.
  }
}

function cachedResource(event, entry) {
  const cachePromise = caches.open(CACHE_NAME);
  const resourcePromise = cachePromise.then(async (cache) => {
    const cached = await cache.match(entry.url);
    if (cached) return { response: cached, cacheCopy: null };
    let response;
    try {
      response = await fetch(resourceRequest(entry));
    } catch (error) {
      event.waitUntil(reportResourceFailure(event, entry, failureKind(error), null));
      throw error;
    }
    if (!response.ok) {
      event.waitUntil(reportResourceFailure(event, entry, "status", response.status));
      throw new Error("Editor offline resource unavailable");
    }
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

async function freshShell(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.type === "opaqueredirect" || response.ok) return response;
    throw new Error(`Editor shell returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (!EDITOR_PATHS.has(url.pathname) || !shellUrl) return;
    const shell = entriesByPath.get(new URL(shellUrl).pathname);
    if (!shell) return;
    // HTML is network-first: a deployed release must reach the next navigation, not the one
    // after it. The installed shell is only the offline/slow-network/5xx fallback.
    event.respondWith(
      freshShell(url).catch(() =>
        cachedResource(event, shell).catch(
          () => new Response("Offline", { status: 503, statusText: "Offline" }),
        ),
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
