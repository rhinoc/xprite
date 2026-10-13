// Executed by scripts/visual-audit/base/browser.mjs; the wrapper supplies continuityConfig.
const fs = await import("node:fs/promises");
const { captureBrowserScreenshot, navigateWithTransientRetry } = await import(
  continuityConfig.screenshotModule
);
const task = await taskSpace(continuityConfig.spaceId ?? "Xprite startup continuity");
if (task.ownership !== "agent") throw Error("Startup continuity requires an agent-owned space.");
console.log(`CONTINUITY_SPACE:${task.spaceId}`);
const page = task.page("p1");
const results = [];
const EDITOR_MODULE_FAILURE_MESSAGE = "Failed to load editor module";
const RUNTIME_PAGE_RETRIES = 2;
const RUNTIME_PAGE_RETRY_DELAY_MILLISECONDS = 1_000;
const SCENE_RETRIES = 1;
const SCENE_RETRY_DELAY_MILLISECONDS = 1_000;
const TRANSIENT_SCENE_FAILURE =
  /(?:CDP request timed out: Page\.captureScreenshot|PageEvaluationTimeoutError|page\.evaluate timed out|net::ERR_(?:CONNECTION_REFUSED|CONNECTION_RESET|EMPTY_RESPONSE|HTTP_RESPONSE_CODE_FAILURE)|Failed to load editor module)/;
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
  let sceneAttempt = 0;
  while (true) {
    const origin = `http://xprite-continuity-${scene.id.toLowerCase()}.${continuityConfig.runId}.localhost:${continuityConfig.port}`;
    const url = `${origin}${scene.page.path}`;
    const result = { id: scene.id, url, passed: false };
    let retryScene = false;
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
      ${scene.page.language ? `localStorage.setItem("xse.ui.language.v1",${JSON.stringify(scene.page.language)});` : ""}
      localStorage.setItem("xprite.components.appearance",${JSON.stringify(JSON.stringify({ theme: scene.page.componentsTheme ?? "macintosh" }))});
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
      await navigateWithTransientRetry(page, url);
      await page.waitForFunction(() => window.__xpriteStartupMonitor?.initialized, undefined, {
        timeout: continuityConfig.startupTimeoutMilliseconds,
      });
      await page.waitForFunction(() => window.__xpriteStartupMonitor?.imagesReady, undefined, {
        timeout: continuityConfig.startupTimeoutMilliseconds,
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await window.__xpriteStartupMonitor.decodeImages();
      });
      result.staticScreenshot = await capture("static");
      await page.cdp("Network.setBlockedURLs", { urls: [] });
      let runtimeReady = false;
      for (let attempt = 0; attempt <= RUNTIME_PAGE_RETRIES; attempt++) {
        await navigateWithTransientRetry(page, url);
        let runtimeState;
        // A late font subset (CJK glyphs load by unicode-range) can flip document.fonts back to
        // "loading" right after the monitor reported completion; wait for it and observe again.
        for (let fontWait = 0; ; fontWait++) {
          await page.waitForFunction(
            (failureMessage) =>
              !!window.__xpriteStartupMonitor?.complete ||
              (document.querySelector('[role="alert"]')?.innerText ?? "").includes(failureMessage),
            EDITOR_MODULE_FAILURE_MESSAGE,
            { timeout: continuityConfig.startupTimeoutMilliseconds },
          );
          runtimeState = await page.evaluate((failureMessage) => {
            const error = document.querySelector('[role="alert"]')?.innerText ?? "";
            return {
              ready: !!window.__xpriteStartupMonitor?.complete,
              retryable: error.includes(failureMessage),
              fontsLoading: document.fonts.status === "loading",
              error,
            };
          }, EDITOR_MODULE_FAILURE_MESSAGE);
          if (runtimeState.ready || runtimeState.retryable || !runtimeState.fontsLoading) break;
          if (fontWait >= 5) break;
          await page.evaluate(() => document.fonts.ready);
        }
        if (runtimeState.ready) {
          runtimeReady = true;
          break;
        }
        if (!runtimeState.retryable || attempt === RUNTIME_PAGE_RETRIES)
          throw Error(runtimeState.error || `${scene.id}: startup did not complete.`);
        await page.goto("about:blank");
        await new Promise((resolve) =>
          setTimeout(resolve, RUNTIME_PAGE_RETRY_DELAY_MILLISECONDS * (attempt + 1)),
        );
      }
      if (!runtimeReady)
        throw Error(`${scene.id}: startup did not complete after a transient module failure.`);
      const language = await page.evaluate(() => document.documentElement.lang);
      if (scene.page.language && language !== scene.page.language)
        throw Error(`${scene.id}: expected ${scene.page.language}, received ${language}.`);
      result.language = language;
      await page.evaluate(() => window.__xpriteStartupMonitor.decodeImages());
      result.readyScreenshot = await capture("ready");
      result.observation = await page.evaluate(() => window.__xpriteStartupMonitor.stop());
      result.passed = result.observation.complete && result.observation.failures.length === 0;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      const transientFailure = TRANSIENT_SCENE_FAILURE.test(result.error);
      retryScene = transientFailure && sceneAttempt < SCENE_RETRIES;
      result.observation = await page
        .evaluate(() => window.__xpriteStartupMonitor?.stop() ?? null)
        .catch(() => null);
      if (!retryScene) result.failureScreenshot = await capture("failure").catch(() => undefined);
    } finally {
      await page.cdp("Network.setBlockedURLs", { urls: [] }).catch(() => {});
      await page
        .cdp("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: initialization.identifier,
        })
        .catch(() => {});
    }
    if (retryScene) {
      sceneAttempt++;
      console.log(`CONTINUITY_RETRY:${scene.id}:${sceneAttempt}`);
      await page.goto("about:blank");
      await new Promise((resolve) =>
        setTimeout(resolve, SCENE_RETRY_DELAY_MILLISECONDS * sceneAttempt),
      );
      continue;
    }
    results.push(result);
    await fs.writeFile(
      `${continuityConfig.output}/${scene.id}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(`CONTINUITY_SCENE:${scene.id}:${result.passed ? "passed" : "failed"}`);
    break;
  }
}
await page.cdp("Network.setCacheDisabled", { cacheDisabled: false });
await page.cdp("Emulation.setCPUThrottlingRate", { rate: 1 });
if (continuityConfig.spaceId === undefined) await task.finish({ keep: [] });
console.log(`STARTUP_CONTINUITY_REPORT:${JSON.stringify({ results })}`);
