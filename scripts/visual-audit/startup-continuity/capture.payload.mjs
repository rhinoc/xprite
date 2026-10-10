// Executed by ego-browser nodejs; the wrapper supplies continuityConfig.
const fs = await import("node:fs/promises");
const { captureBrowserScreenshot } = await import(continuityConfig.screenshotModule);
const task = await taskSpace("Xprite startup continuity");
if (task.ownership !== "agent") throw Error("Startup continuity requires an agent-owned space.");
console.log(`CONTINUITY_SPACE:${task.spaceId}`);
const page = task.page("p1");
const results = [];
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
await page.cdp("Network.enable");
await page.cdp("Network.setCacheDisabled", { cacheDisabled: true });
await page.cdp("Emulation.setCPUThrottlingRate", { rate: continuityConfig.cpuSlowdown });

for (const scene of continuityConfig.scenes) {
  const origin = `http://xprite-continuity-${scene.id.toLowerCase()}.${continuityConfig.runId}.localhost:${continuityConfig.port}`;
  const url = `${origin}${scene.page.path}`;
  const result = { id: scene.id, url, passed: false };
  await page.goto("about:blank");
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
    viewport: { x: 0, y: 0, width: scene.layout.width, height: scene.layout.height, scale: 1 },
  });
  await page.cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: scene.appearance.system }],
  });
  const monitorConfig = {
    regions: scene.page.regions,
    ready: scene.page.ready,
    minimumReadyFrames: continuityConfig.minimumReadyFrames,
    readyObservationMilliseconds: continuityConfig.readyObservationMilliseconds,
  };
  const initialization = await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `if(location.origin===${JSON.stringify(origin)}){
      localStorage.setItem("xprite.site.desktop-preferences",${JSON.stringify(JSON.stringify({ appearance: scene.appearance.saved }))});
      localStorage.setItem("xse.ui.appearance-mode.v1",${JSON.stringify(scene.appearance.saved)});
      localStorage.setItem("xprite.gallery.appearance",${JSON.stringify(JSON.stringify({ theme: scene.page.galleryTheme ?? "macintosh" }))});
      ${continuityConfig.geometrySource}
      (${continuityConfig.monitorSource})(${JSON.stringify(monitorConfig)},StartupGeometry);
    }`,
  });
  const capture = (phase) =>
    captureBrowserScreenshot(page, {
      path: `${continuityConfig.output}/${scene.id}-${phase}.png`,
      expectedDpr: 1,
    });
  try {
    // Prove the original first paint is available without runtime modules.
    await page.cdp("Network.setBlockedURLs", { urls: MODULE_URLS });
    await page.goto(url);
    await page.waitForFunction(() => window.__xpriteStartupMonitor?.initialized, undefined, {
      timeout: continuityConfig.startupTimeoutMilliseconds,
    });
    await page.waitForFunction(
      () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      undefined,
      { timeout: continuityConfig.startupTimeoutMilliseconds },
    );
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    result.staticScreenshot = await capture("static");
    await page.cdp("Network.setBlockedURLs", { urls: [] });
    await page.goto(url);
    await page.waitForFunction(() => window.__xpriteStartupMonitor?.complete, undefined, {
      timeout: continuityConfig.startupTimeoutMilliseconds,
    });
    result.readyScreenshot = await capture("ready");
    result.observation = await page.evaluate(() => window.__xpriteStartupMonitor.stop());
    result.passed = result.observation.complete && result.observation.failures.length === 0;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.observation = await page.evaluate(() => window.__xpriteStartupMonitor?.stop() ?? null);
    result.failureScreenshot = await capture("failure");
  } finally {
    await page.cdp("Network.setBlockedURLs", { urls: [] });
    await page.cdp("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: initialization.identifier,
    });
  }
  results.push(result);
  await fs.writeFile(
    `${continuityConfig.output}/${scene.id}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(`CONTINUITY_SCENE:${scene.id}:${result.passed ? "passed" : "failed"}`);
}
await page.cdp("Network.setCacheDisabled", { cacheDisabled: false });
await page.cdp("Emulation.setCPUThrottlingRate", { rate: 1 });
await task.finish({ keep: [] });
console.log(`STARTUP_CONTINUITY_REPORT:${JSON.stringify({ results })}`);
