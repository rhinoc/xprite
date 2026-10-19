import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, it } from "vitest";

const ORIGIN = "https://xprite.test";
const SOURCE = readFileSync(new URL("./sw.js", import.meta.url), "utf8");

type Handler = (event: Record<string, unknown>) => void;

class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(request: string | Request) {
    const hit = this.entries.get(typeof request === "string" ? request : request.url);
    return hit?.clone();
  }
  async put(request: string | Request, response: Response) {
    this.entries.set(typeof request === "string" ? request : request.url, response);
  }
  async addAll(requests: Request[]) {
    const responses = await Promise.all(
      requests.map(async (request) => {
        const response = await fetchMock.current(request);
        if (!response.ok) throw new TypeError("Request failed");
        return [request.url, response] as const;
      }),
    );
    for (const [url, response] of responses) this.entries.set(url, response);
  }
}

const fetchMock: { current: (request: Request) => Promise<Response> } = {
  current: async () => new Response("", { status: 404 }),
};

function build(version: string, files: Record<string, string>) {
  const entries = Object.keys(files).map((url) => ({ url, integrity: `sha256-${version}` }));
  return { version, shell: "editor-offline-x.html", entries };
}

function createWorker(offlineBuild: ReturnType<typeof build>, existing: Record<string, FakeCache>) {
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, FakeCache>(Object.entries(existing));
  const posted: unknown[] = [];
  const calls = { skipWaiting: 0, claim: 0, matchAll: 0 };
  const caches = {
    async open(name: string) {
      let cache = stores.get(name);
      if (!cache) stores.set(name, (cache = new FakeCache()));
      return cache;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: async () => void calls.skipWaiting++,
    clients: {
      claim: async () => void calls.claim++,
      matchAll: async () => {
        calls.matchAll++;
        return [{ url: `${ORIGIN}/editor` }];
      },
      get: async () => ({ postMessage: (message: unknown) => posted.push(message) }),
    },
  };
  const source = SOURCE.replace(
    "const OFFLINE_BUILD = null;",
    `const OFFLINE_BUILD = ${JSON.stringify(offlineBuild)};`,
  );
  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    Request,
    Response,
    Map,
    Set,
    Promise,
    AbortController,
    setTimeout,
    clearTimeout,
    Number,
    String,
    Date,
    JSON,
    fetch: (request: Request) => fetchMock.current(request),
  });
  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    const event = { waitUntil: (promise: Promise<unknown>) => waits.push(promise), ...extra };
    handlers.get(type)!(event);
    await Promise.all(waits);
    return event;
  }
  return { stores, calls, posted, dispatch, handlers };
}

function releaseCache(name: string, installed: number | null, resources: string[] = []) {
  const cache = new FakeCache();
  if (installed !== null)
    cache.entries.set(`${ORIGIN}/__xprite_offline_installed__`, new Response(String(installed)));
  for (const resource of resources) cache.entries.set(`${ORIGIN}${resource}`, new Response(name));
  return cache;
}

const NEW_FILES = { "assets/app-NEW11111.js": "", "assets/chunk-NEW22222.js": "" };

describe("editor service worker releases", () => {
  it("precaches the complete release before it skips waiting", async () => {
    fetchMock.current = async () => new Response("ok");
    const worker = createWorker(build("new", NEW_FILES), {});
    await worker.dispatch("install");
    const cache = worker.stores.get("xprite-editor-new")!;
    assert.ok(cache.entries.has(`${ORIGIN}/assets/chunk-NEW22222.js`));
    assert.equal(worker.calls.skipWaiting, 1);
  });

  it("does not activate a partial release", async () => {
    fetchMock.current = async (request) =>
      request.url.includes("chunk") ? new Response("", { status: 503 }) : new Response("ok");
    const worker = createWorker(build("new", NEW_FILES), {});
    await assert.rejects(worker.dispatch("install"));
    assert.equal(worker.calls.skipWaiting, 0);
    assert.equal(worker.stores.has("xprite-editor-new"), false);
  });

  it("keeps the newest previous releases while an editor window is open and prunes older ones", async () => {
    const worker = createWorker(build("new", NEW_FILES), {
      "xprite-editor-new": releaseCache("new", 400),
      "xprite-editor-prev1": releaseCache("prev1", 300),
      "xprite-editor-prev2": releaseCache("prev2", 200),
      "xprite-editor-oldest": releaseCache("oldest", 100),
      "xprite-editor-unmarked": releaseCache("unmarked", null),
      "unrelated-cache": releaseCache("other", 1),
    });
    await worker.dispatch("activate");
    assert.deepEqual(
      [...worker.stores.keys()].sort(),
      ["unrelated-cache", "xprite-editor-new", "xprite-editor-prev1", "xprite-editor-prev2"].sort(),
    );
    assert.equal(worker.calls.claim, 1);
    // Retention no longer depends on guessing which windows are editors.
    assert.equal(worker.calls.matchAll, 0);
  });

  it("serves a previous release's lazy chunk to a tab that still runs it", async () => {
    fetchMock.current = async () => {
      throw new TypeError("network must not be used");
    };
    const worker = createWorker(build("new", NEW_FILES), {
      "xprite-editor-new": releaseCache("new", 400),
      "xprite-editor-prev1": releaseCache("prev1", 300, ["/assets/old-dialog-OLD33333.js"]),
    });
    await worker.dispatch("activate");
    let responded: Promise<Response> | undefined;
    await worker.dispatch("fetch", {
      request: new Request(`${ORIGIN}/assets/old-dialog-OLD33333.js`),
      respondWith: (response: Promise<Response>) => (responded = response),
    });
    assert.equal(await (await responded!).text(), "prev1");
  });

  it("serves a newer shell from the network and falls back to the installed shell offline", async () => {
    const worker = createWorker(build("new", { "editor-offline-x.html": "", ...NEW_FILES }), {
      "xprite-editor-new": releaseCache("new", 400, ["/editor-offline-x.html"]),
    });
    const navigate = async () => {
      let responded: Promise<Response> | undefined;
      await worker.dispatch("fetch", {
        request: { method: "GET", mode: "navigate", url: `${ORIGIN}/?x=1` },
        respondWith: (response: Promise<Response>) => (responded = response),
      });
      return (await responded!).text();
    };
    fetchMock.current = async () => new Response("network-html");
    assert.equal(await navigate(), "network-html");
    fetchMock.current = async () => new Response("", { status: 503 });
    assert.equal(await navigate(), "new");
    fetchMock.current = async () => {
      throw new TypeError("offline");
    };
    assert.equal(await navigate(), "new");
  });

  it("tells the page when a build resource fails its fetch or integrity check", async () => {
    fetchMock.current = async () => {
      throw new TypeError("Failed to find a valid digest in the 'integrity' attribute");
    };
    const worker = createWorker(build("new", NEW_FILES), {});
    let responded: Promise<Response> | undefined;
    await worker.dispatch("fetch", {
      clientId: "client",
      request: new Request(`${ORIGIN}/assets/chunk-NEW22222.js`),
      respondWith: (response: Promise<Response>) => (responded = response),
    });
    await assert.rejects(responded!);
    assert.deepEqual(JSON.parse(JSON.stringify(worker.posted)), [
      {
        type: "XPRITE_OFFLINE_FETCH_FAILED",
        path: "/assets/chunk-NEW22222.js",
        failure: "integrity",
        status: null,
        version: "new",
      },
    ]);
  });

  it("reports whether a URL belongs to its release", async () => {
    const worker = createWorker(build("new", NEW_FILES), {});
    const replies: unknown[] = [];
    const ports = [{ postMessage: (message: unknown) => replies.push(message) }];
    for (const url of ["/assets/chunk-NEW22222.js", "/assets/gone-OLD33333.js"])
      await worker.dispatch("message", {
        data: { type: "XPRITE_OFFLINE_HAS_RESOURCE", url },
        ports,
      });
    assert.deepEqual(JSON.parse(JSON.stringify(replies)), [
      { type: "XPRITE_OFFLINE_HAS_RESOURCE", present: true, version: "new" },
      { type: "XPRITE_OFFLINE_HAS_RESOURCE", present: false, version: "new" },
    ]);
  });
});
