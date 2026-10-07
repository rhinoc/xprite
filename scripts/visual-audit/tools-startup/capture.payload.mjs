// Executed by ego-browser nodejs; the wrapper supplies captureConfig.
const fs = await import("node:fs/promises");
const { captureBrowserScreenshot } = await import(captureConfig.screenshotModule);
const task = await taskSpace(captureConfig.spaceId ?? "Xprite SSG first paint comparison");
if (task.ownership !== "agent") throw Error("Startup capture requires an agent-owned space.");
console.log(`CAPTURE_SPACE:${task.spaceId}`);
const page = task.page("p1");
const pairs = [];
const MODULE_URLS = [
  "*.js",
  "*.js?*",
  "*.jsx",
  "*.jsx?*",
  "*.ts",
  "*.ts?*",
  "*.tsx",
  "*.tsx?*",
  "*/@vite/*",
  "*/@react-refresh*",
];
const MAXIMUM_CAPTURE_ATTEMPTS = 12;
const REQUIRED_IDENTICAL_CAPTURES = 2;
await page.cdp("Network.enable");
await page.cdp("Network.setCacheDisabled", { cacheDisabled: true });
await page.cdp("DOM.enable");
await page.cdp("CSS.enable");

const regions = async (scene) => {
  const root = `#${scene.page.rootId}`;
  const selectors = {
    header: `${root} header`,
    main: `${root} main`,
    headline: scene.page.name === "tools" ? `${root} main [data-slot="panel-title"]` : `${root} h1`,
    ...(scene.page.name === "tools"
      ? {
          viewer: `${root} main a[href="/tools/viewer/"]`,
          gifSheet: `${root} main a[href="/tools/gif-to-sprite-sheet/"]`,
          editor: `${root} main a[href="/"]`,
          animalCrossing: `${root} main a[href="/tools/animal-crossing-qr/"]`,
        }
      : { examples: `${root} [data-slot="panel"][aria-label="Try example"]` }),
  };
  const document = await page.cdp("DOM.getDocument");
  const result = [];
  for (const [name, selector] of Object.entries(selectors)) {
    const { nodeId } = await page.cdp("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector,
    });
    if (!nodeId) throw Error(`${scene.id}: missing region ${name}.`);
    const { model } = await page.cdp("DOM.getBoxModel", { nodeId });
    const x = Math.min(...model.border.filter((_, index) => index % 2 === 0));
    const y = Math.min(...model.border.filter((_, index) => index % 2 === 1));
    const width = Math.max(...model.border.filter((_, index) => index % 2 === 0)) - x;
    const height = Math.max(...model.border.filter((_, index) => index % 2 === 1)) - y;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
      throw Error(`${scene.id}: invalid region ${name}.`);
    result.push({ name, x, y, width, height });
  }
  return result;
};

const capture = async (scene, phase, url) => {
  const selector =
    phase === "ssg"
      ? `#${scene.page.rootId}[data-tool-startup-view]`
      : `#${scene.page.rootId}[data-tool-ready] .xse-global`;
  await page.goto(url);
  await page.waitForSelector(selector, { state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  await page.mouse.move(scene.layout.width - 1, scene.layout.height - 1, {
    label: "clear pointer before startup capture",
  });
  const state = await page.evaluate(
    ({ rootId, phase }) => {
      const root = document.getElementById(rootId);
      if (!root || root.hasAttribute("data-tool-startup-view") !== (phase === "ssg"))
        throw Error(`Wrong startup phase: ${phase}`);
      if (root.hasAttribute("data-tool-hydration-error"))
        throw Error(root.dataset.toolHydrationError);
      return {
        url: location.href,
        language: document.documentElement.lang,
      };
    },
    { rootId: scene.page.rootId, phase },
  );
  const document = await page.cdp("DOM.getDocument");
  const { nodeId } = await page.cdp("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector,
  });
  const { computedStyle } = await page.cdp("CSS.getComputedStyleForNode", { nodeId });
  const appearance = computedStyle.find(({ name }) => name === "color-scheme")?.value;
  const file = `${scene.id}-${phase}.png`;
  let previousHash;
  let identical = 0;
  for (let attempt = 0; attempt < MAXIMUM_CAPTURE_ATTEMPTS; attempt++) {
    const before = await regions(scene);
    const screenshot = await captureBrowserScreenshot(page, {
      path: `${captureConfig.output}/${file}`,
      expectedDpr: 1,
      metadataPath: null,
    });
    const after = await regions(scene);
    const geometryStable = JSON.stringify(before) === JSON.stringify(after);
    identical = screenshot.sha256 === previousHash && geometryStable ? identical + 1 : 1;
    previousHash = screenshot.sha256;
    if (identical >= REQUIRED_IDENTICAL_CAPTURES && geometryStable) {
      await page.evaluate((rootId) => {
        const root = document.getElementById(rootId);
        if (root?.hasAttribute("data-tool-hydration-error"))
          throw Error(root.dataset.toolHydrationError);
      }, scene.page.rootId);
      return { phase, file, screenshot, regions: after, appearance, ...state };
    }
  }
  throw Error(`${scene.id}/${phase}: screenshots did not stabilize.`);
};

for (const scene of captureConfig.scenes) {
  const origin = `http://xprite-tools-startup-${scene.layout.name}-${scene.appearance.name}.localhost:${captureConfig.port}`;
  const url = `${origin}${scene.page.path}`;
  await page.goto("about:blank");
  await page.cdp("Storage.clearDataForOrigin", {
    origin,
    storageTypes: "local_storage,indexeddb,cache_storage,service_workers",
  });
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: scene.layout.width,
    height: scene.layout.height,
    deviceScaleFactor: 1,
    mobile: false,
    scale: 1,
    screenWidth: scene.layout.width,
    screenHeight: scene.layout.height,
    positionX: 0,
    positionY: 0,
    viewport: {
      x: 0,
      y: 0,
      width: scene.layout.width,
      height: scene.layout.height,
      scale: 1,
    },
  });
  await page.cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: scene.appearance.system }],
  });
  const initialization = await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `if(location.origin===${JSON.stringify(origin)})localStorage.setItem("xse.ui.appearance-mode.v1",${JSON.stringify(scene.appearance.saved)});`,
  });
  // Block external runtime modules only; the real inline appearance script and CSS still run.
  await page.cdp("Network.setBlockedURLs", { urls: MODULE_URLS });
  const ssg = await capture(scene, "ssg", url);
  await page.cdp("Network.setBlockedURLs", { urls: [] });
  const ready = await capture(scene, "ready", url);
  const pair = { id: scene.id, url, ssg, ready };
  pairs.push(pair);
  await fs.writeFile(`${captureConfig.output}/${scene.id}.json`, JSON.stringify(pair, null, 2));
  console.log(`CAPTURE_PAIR:${scene.id}`);
  await page.cdp("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: initialization.identifier,
  });
}
await task.finish({ keep: [] });
console.log(`TOOLS_STARTUP_REPORT:${JSON.stringify({ pairs })}`);
