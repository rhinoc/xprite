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
await page.cdp("Emulation.setCPUThrottlingRate", { rate: captureConfig.cpuSlowdown });
await page.cdp("DOM.enable");
await page.cdp("CSS.enable");

const pageRoot = (scene) => (scene.page.publicPage ? "body" : `#${scene.page.rootId}`);
const pageReady = (scene) =>
  scene.page.publicPage
    ? "html[data-public-controls-ready]"
    : `#${scene.page.rootId}[data-tool-ready]`;
const regions = async (scene) => {
  const root = pageRoot(scene);
  const localeQuery = scene.page.language === "zh-CN" ? "?lang=zh-CN" : "";
  const selectors = {
    header: `${root} header`,
    main: `${root} main`,
    headline: scene.page.publicPage
      ? `${root} main h1`
      : `${root} main [data-ui-window-priority="primary"] [data-slot="panel-title"]`,
    ...(scene.page.publicPage
      ? {
          viewer: `${root} main a[href="/tools/viewer/${localeQuery}"]`,
          gifSheet: `${root} main a[href="/tools/gif-to-sprite-sheet/${localeQuery}"]`,
          editor: `${root} main a[href="/editor"]`,
          animalCrossing: `${root} main a[href="/tools/animal-crossing-qr/${localeQuery}"]`,
        }
      : {
          examples: `${root} [data-slot="panel"][aria-label="${scene.page.language === "zh-CN" ? "试用示例" : "Try example"}"]`,
        }),
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
  const selector = scene.page.publicPage
    ? phase === "ssg"
      ? pageRoot(scene)
      : pageReady(scene)
    : phase === "ssg"
      ? `#${scene.page.rootId}[data-tool-startup-view]`
      : `${pageReady(scene)} .xse-global`;
  await page.goto(url);
  await page.waitForSelector(selector, {
    state: "visible",
    timeout: captureConfig.startupTimeoutMilliseconds,
  });
  await page.waitForFunction(
    () => document.fonts.status === "loaded" && window.__xpriteStartupMonitor?.imagesReady,
    undefined,
    { timeout: captureConfig.startupTimeoutMilliseconds },
  );
  await page.evaluate(() => window.__xpriteStartupMonitor.decodeImages());
  if (phase === "ready")
    await page.waitForFunction(() => window.__xpriteStartupMonitor?.complete, undefined, {
      timeout: captureConfig.startupTimeoutMilliseconds,
    });
  await page.mouse.move(scene.layout.width - 1, scene.layout.height - 1, {
    label: "clear pointer before startup capture",
  });
  const state = await page.evaluate(
    ({ rootId, publicPage, phase }) => {
      const root = publicPage ? document.body : document.getElementById(rootId);
      const staticView = publicPage
        ? !document.documentElement.hasAttribute("data-public-controls-ready")
        : root?.hasAttribute("data-tool-startup-view");
      if (!root || staticView !== (phase === "ssg")) throw Error(`Wrong startup phase: ${phase}`);
      if (root.hasAttribute("data-tool-hydration-error"))
        throw Error(root.dataset.toolHydrationError);
      const publicError = document.querySelector("[data-public-hydration-error]");
      if (publicError) throw Error(publicError.dataset.publicHydrationError);
      return {
        url: location.href,
        language: document.documentElement.lang,
      };
    },
    { rootId: scene.page.rootId ?? null, publicPage: !!scene.page.publicPage, phase },
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
        const publicError = document.querySelector("[data-public-hydration-error]");
        if (publicError) throw Error(publicError.dataset.publicHydrationError);
      }, scene.page.rootId ?? null);
      const observation =
        phase === "ready"
          ? await page.evaluate(() => window.__xpriteStartupMonitor.stop())
          : undefined;
      if (observation)
        await fs.writeFile(
          `${captureConfig.output}/${scene.id}-continuity.json`,
          JSON.stringify(observation, null, 2),
        );
      if (
        phase === "ready" &&
        (!observation?.complete ||
          observation.failures.length ||
          !observation.regions.every(({ seen }) => seen))
      )
        throw Error(`${scene.id}: startup content disappeared or observation did not complete.`);
      return {
        phase,
        file,
        screenshot,
        regions: after,
        appearance,
        ...(observation ? { observation } : {}),
        ...state,
      };
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
    source: `if(location.origin===${JSON.stringify(origin)}){
      localStorage.setItem("xprite.site.desktop-preferences",${JSON.stringify(JSON.stringify({ appearance: scene.appearance.saved }))});
      localStorage.setItem("xse.ui.appearance-mode.v1",${JSON.stringify(scene.appearance.saved)});
      ${captureConfig.geometrySource}
      (${captureConfig.monitorSource})(${JSON.stringify({
        regions: [
          { name: "page", selectors: [pageRoot(scene)] },
          { name: "navigation", selectors: [`${pageRoot(scene)} header`] },
          { name: "main", selectors: [`${pageRoot(scene)} main`] },
        ],
        ready: pageReady(scene),
        minimumReadyFrames: captureConfig.minimumReadyFrames,
        readyObservationMilliseconds: captureConfig.readyObservationMilliseconds,
      })},StartupGeometry);
    }`,
  });
  try {
    // Block runtime modules; the inline appearance script and CSS still run.
    await page.cdp("Network.setBlockedURLs", { urls: MODULE_URLS });
    const ssg = await capture(scene, "ssg", url);
    await page.cdp("Network.setBlockedURLs", { urls: [] });
    const ready = await capture(scene, "ready", url);
    const pair = { id: scene.id, url, ssg, ready };
    pairs.push(pair);
    await fs.writeFile(`${captureConfig.output}/${scene.id}.json`, JSON.stringify(pair, null, 2));
    console.log(`CAPTURE_PAIR:${scene.id}`);
  } catch (error) {
    const observation = await page.evaluate(() => window.__xpriteStartupMonitor?.stop() ?? null);
    await fs.writeFile(
      `${captureConfig.output}/${scene.id}-continuity.json`,
      JSON.stringify({ observation, error: String(error) }, null, 2),
    );
    await captureBrowserScreenshot(page, {
      path: `${captureConfig.output}/${scene.id}-failure.png`,
      expectedDpr: 1,
    });
    throw error;
  } finally {
    await page.cdp("Network.setBlockedURLs", { urls: [] });
    await page.cdp("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: initialization.identifier,
    });
  }
}
await page.cdp("Network.setCacheDisabled", { cacheDisabled: false });
await page.cdp("Emulation.setCPUThrottlingRate", { rate: 1 });
if (captureConfig.spaceId === undefined) await task.finish({ keep: [] });
console.log(`TOOLS_STARTUP_REPORT:${JSON.stringify({ pairs })}`);
