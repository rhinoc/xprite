// Executed by scripts/visual-audit/base/browser.mjs; the wrapper supplies siteConfig.
const fs = await import("node:fs/promises");
const { captureBrowserScreenshot, navigateWithTransientRetry } = await import(
  siteConfig.screenshotModule
);
const task = await taskSpace(siteConfig.spaceId ?? "Xprite growth and tools visual regression");
if (task.ownership !== "agent")
  throw Error("Visual capture requires an agent-owned browser space.");
const page = task.page("p1");
console.log(`SITE_CAPTURE_SPACE:${task.spaceId}`);
const browser = await page.evaluate(() => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
}));
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
const MAXIMUM_ATTEMPTS = 12;
const IDENTICAL_CAPTURES = 2;
const cases = [];
await page.cdp("Network.enable");
await page.cdp("Network.setCacheDisabled", { cacheDisabled: true });
await page.cdp("DOM.enable");

const isToolPath = (path) => /^(?:\/[a-z]{2}(?:-[A-Z]{2})?)?\/tools\/[^/]+\/$/.test(path);
const geometry = async (scene) => {
  const document = await page.cdp("DOM.getDocument");
  const regions = [
    { name: "page", x: 0, y: 0, width: scene.layout.width, height: scene.layout.height },
  ];
  for (const region of scene.page.regions) {
    const { nodeId } = await page.cdp("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: region.selector,
    });
    if (!nodeId) throw Error(`${scene.id}: missing region ${region.name}.`);
    const { model } = await page.cdp("DOM.getBoxModel", { nodeId });
    const xs = model.border.filter((_, index) => index % 2 === 0),
      ys = model.border.filter((_, index) => index % 2 === 1);
    regions.push({
      name: region.name,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    });
  }
  if (
    regions.some(
      ({ x, y, width, height }) =>
        ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0,
    )
  )
    throw Error(`${scene.id}: invalid geometry.`);
  // Mobile regression guard: a phone tool screen is exactly one viewport tall (no page scroll);
  // windows and desktop icons stay below the menu bar and inside the viewport, and a window body
  // whose content overflows scrolls on its own.
  const isTool = isToolPath(scene.page.path);
  const windowFaults = !isTool
    ? []
    : await page.evaluate(async () => {
        const bar = document.querySelector("[role=menubar]");
        const width = window.innerWidth,
          height = window.innerHeight;
        if (!bar || width > 700) return [];
        const top = bar.getBoundingClientRect().bottom;
        const root = document.documentElement;
        const faults = [];
        if (root.scrollHeight > height + 1 || root.scrollWidth > width + 1)
          faults.push(`page scrolls (${root.scrollWidth}x${root.scrollHeight})`);
        for (const node of document.querySelectorAll(
          "[data-ui-panel-variant], [class*=entryCursor], [data-slot=desktop-icon-label]",
        )) {
          const rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const name = node.getAttribute("aria-label") ?? node.className;
          if (rect.top < top - 0.5) faults.push(`${name}: under menu bar`);
          if (rect.left < -0.5 || rect.right > width + 0.5 || rect.bottom > height + 0.5)
            faults.push(`${name}: outside viewport`);
        }
        for (const body of document.querySelectorAll(
          "[data-ui-panel-variant] > [data-slot=panel-body]",
        )) {
          const overflowY = getComputedStyle(body).overflowY;
          if (body.scrollHeight > body.clientHeight + 1 && !["auto", "scroll"].includes(overflowY))
            faults.push(`${body.parentElement.getAttribute("aria-label")}: body cannot scroll`);
        }
        // WindowShade: rolling a window up leaves only its title bar, the other windows grow
        // into the freed height, and rolling it down again restores it.
        const windows = [...document.querySelectorAll("[data-ui-desktop-window]")].filter(
          (node) => node.getBoundingClientRect().height > 0,
        );
        const shade = windows.find(
          (node) =>
            node instanceof HTMLDetailsElement &&
            node.open &&
            node.querySelector(":scope > summary"),
        );
        if (shade && windows.length > 1) {
          const bar = shade.querySelector(":scope > summary");
          const others = windows.filter((node) => node !== shade);
          const total = () =>
            others.reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
          const frame = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const toggle = () =>
            bar.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
          const name = bar.textContent.trim() || "window";
          const expandedOthers = total();
          if (bar.getAttribute("aria-expanded") !== "true")
            faults.push(`${name}: open title bar lacks aria-expanded=true`);
          toggle();
          await frame();
          if (shade.open || bar.getAttribute("aria-expanded") !== "false")
            faults.push(`${name}: double-click did not roll the window up`);
          if (shade.getBoundingClientRect().height > bar.getBoundingClientRect().height + 6)
            faults.push(`${name}: rolled-up window is taller than its title bar`);
          // A docked adjust panel that is itself rolled up (phones) has nothing to grow into.
          const canGrow = others.some((node) => node instanceof HTMLDetailsElement && node.open);
          if (canGrow && total() <= expandedOthers + 1)
            faults.push(`${name}: other windows did not grow into the freed space`);
          toggle();
          await frame();
          if (!shade.open || bar.getAttribute("aria-expanded") !== "true")
            faults.push(`${name}: double-click did not restore the window`);
        }
        return faults;
      });
  if (windowFaults.length) throw Error(`${scene.id}: window geometry: ${windowFaults.join("; ")}`);
  return regions;
};
const decodeVisibleImages = async () =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const viewport = SiteGeometry.viewportSize();
    const images = [...document.images].filter((image) => {
      const rect = SiteGeometry.clientRect(image);
      if (
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= viewport.width ||
        rect.top >= viewport.height
      )
        return false;
      for (let parent = image.parentElement; parent; parent = parent.parentElement) {
        const style = SiteGeometry.computedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (
          [style.overflow, style.overflowX, style.overflowY].some((value) =>
            ["auto", "scroll", "hidden", "clip"].includes(value),
          )
        ) {
          const box = SiteGeometry.clientRect(parent);
          if (
            rect.right <= box.left ||
            rect.left >= box.right ||
            rect.bottom <= box.top ||
            rect.top >= box.bottom
          )
            return false;
        }
      }
      return true;
    });
    await Promise.all(images.map((image) => image.decode()));
    if (images.some((image) => !image.complete || !image.naturalWidth))
      throw Error("Visible images did not decode.");
  });

try {
  for (const scene of siteConfig.scenes) {
    const origin = `http://xprite-site-${scene.page.language.toLowerCase()}-${scene.layout.name}-${scene.appearance.name}.${siteConfig.runId}.localhost:${siteConfig.port}`;
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
      viewport: { x: 0, y: 0, width: scene.layout.width, height: scene.layout.height, scale: 1 },
    });
    await page.cdp("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: scene.appearance.system },
        { name: "prefers-reduced-motion", value: scene.motion },
      ],
    });
    const initialization = await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: `if(location.origin===${JSON.stringify(origin)}){
      localStorage.setItem("xprite.site.desktop-preferences",${JSON.stringify(JSON.stringify({ appearance: scene.appearance.saved }))});
      localStorage.setItem("xse.ui.appearance-mode.v1",${JSON.stringify(scene.appearance.saved)});
      localStorage.setItem("xse.ui.language.v1",${JSON.stringify(scene.page.language)});
      ${siteConfig.geometrySource}
      window.__siteVisualErrors=[];
      window.addEventListener("error",event=>window.__siteVisualErrors.push(String(event.error??event.message)));
      window.addEventListener("unhandledrejection",event=>window.__siteVisualErrors.push(String(event.reason)));
    }`,
    });
    try {
      await page.cdp("Network.setBlockedURLs", {
        urls: scene.page.phase === "ssg" ? MODULE_URLS : [],
      });
      await navigateWithTransientRetry(page, origin + scene.page.path);
      await page.waitForSelector(scene.page.ready, { timeout: siteConfig.timeout });
      if (scene.page.action === "example") {
        await page.waitForSelector('[data-tool-state="empty"]');
        const selector = `button[aria-label="${{ "zh-CN": "打开示例", ja: "サンプルを開く", ko: "예제 열기", ru: "Открыть пример", "pt-BR": "Abrir exemplo", es: "Abrir ejemplo" }[scene.page.language] ?? "Open example"}"]`;
        await page.click(selector);
        // Opening starts asynchronously; let the tool report busy/ready before judging the click.
        await page
          .waitForFunction(
            () =>
              !!document.querySelector('[data-tool-state="ready"]') ||
              !!document.querySelector('main [aria-busy="true"]'),
            undefined,
            { timeout: 2000 },
          )
          .catch(() => {});
        const activation = await page.evaluate(
          (label) => ({
            ready: !!document.querySelector('[data-tool-state="ready"]'),
            busy: !!document.querySelector('main [aria-busy="true"]'),
            active: document
              .querySelector(`button[aria-label=${JSON.stringify(label)}]`)
              ?.closest("[data-ui-desktop-window]")
              ?.getAttribute("data-ui-window-active"),
          }),
          {
            "zh-CN": "打开示例",
            ja: "サンプルを開く",
            ko: "예제 열기",
            ru: "Открыть пример",
            "pt-BR": "Abrir exemplo",
            es: "Abrir ejemplo",
          }[scene.page.language] ?? "Open example",
        );
        if (!activation.ready && !activation.busy && activation.active === "true")
          await page.click(selector);
        await page.waitForSelector('[data-tool-state="ready"]', { timeout: siteConfig.timeout });
        if (
          await page.evaluate(
            () =>
              !!document.querySelector(
                'button[aria-label="Pause animation"],button[aria-label="暂停动画"]',
              ),
          )
        ) {
          await page.click('button[aria-label="Pause animation"],button[aria-label="暂停动画"]');
        }
      } else if (scene.page.action === "files") {
        // Storage size depends on the machine; pin it so the info bar is stable.
        await page.evaluate(() => {
          navigator.storage.estimate = async () => ({ usage: 3 << 20, quota: 1 << 30 });
        });
        await page.click('nav button[aria-haspopup="dialog"]');
        await page.waitForSelector("[data-files-window]", { timeout: siteConfig.timeout });
        await page.evaluate(async (count) => {
          const input = document.querySelector('[data-files-window] input[type="file"]');
          const transfer = new DataTransfer();
          for (let index = 0; index < count; index++) {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 8;
            const context = canvas.getContext("2d");
            context.fillStyle = ["#e04040", "#4060e0"][index % 2];
            context.fillRect(0, 0, 8, 8);
            context.fillStyle = "#ffffff";
            context.fillRect(2, 2, 4, 4);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            transfer.items.add(new File([blob], `sprite-${index + 1}.png`, { type: "image/png" }));
          }
          if (!count) return;
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }, scene.page.files);
        if (scene.page.files)
          await page.waitForFunction(
            (count) => document.querySelectorAll("[data-files-window] img").length >= count,
            scene.page.files,
            { timeout: siteConfig.timeout },
          );
      } else if (scene.page.action === "feature") {
        await page.evaluate((href) => {
          const item = [...document.querySelectorAll("main [data-ui-desktop-icon]")].find(
            (node) => node.getAttribute("href") === href,
          );
          if (!item) throw Error("Missing feature icon.");
          SiteGeometry.scrollElementIntoView(item, { block: "nearest", behavior: "instant" });
        }, scene.page.href);
        const selector = `main a[href=${JSON.stringify(scene.page.href)}]`;
        await page.click(selector);
        // A window activation click may be consumed; inspect that state before opening it.
        if (!(await page.evaluate(() => !!document.querySelector('[role="dialog"]')))) {
          const state = await page.evaluate(() => ({
            path: location.pathname,
            active: document
              .querySelector("[data-public-document]")
              ?.getAttribute("data-ui-window-active"),
          }));
          if (state.path !== scene.page.path.split("?")[0] || state.active !== "true")
            throw Error("Feature click changed the route or failed to activate its window.");
          await page.click(selector);
        }
        await page.waitForSelector('[role="dialog"]', { timeout: siteConfig.timeout });
        if (scene.page.scrollWindow) {
          await page.evaluate(() => {
            const image = document.querySelector('[role="dialog"] img');
            if (!image) throw Error("Feature illustration is missing.");
            SiteGeometry.scrollElementIntoView(image, { block: "center", behavior: "instant" });
          });
        }
      } else if (scene.page.action === "footer") {
        await page.evaluate(() =>
          SiteGeometry.scrollElementIntoView(document.querySelector("[data-site-footer]"), {
            block: "end",
            behavior: "instant",
          }),
        );
      }
      await page.mouse.move(scene.layout.width - 1, scene.layout.height - 1, {
        label: "clear hover before visual capture",
      });
      await page.evaluate(() => {
        if (document.activeElement?.matches("input,textarea,[contenteditable=true]"))
          document.activeElement.blur();
      });
      await page.waitForSelector('[role="tooltip"]', { state: "hidden" });
      await decodeVisibleImages();
      const state = await page.evaluate(() => ({
        path: location.pathname + location.search,
        language: document.documentElement.lang,
        errors: window.__siteVisualErrors,
        hydration: !!document.querySelector(
          "[data-tool-hydration-error],[data-public-hydration-error]",
        ),
        platform: navigator.platform,
      }));
      if (
        state.path !== scene.page.path ||
        state.language !== scene.page.language ||
        state.errors.length ||
        state.hydration
      )
        throw Error(`${scene.id}: locale, runtime or hydration errors: ${JSON.stringify(state)}`);
      let previous,
        identical = 0,
        entry;
      for (let attempt = 0; attempt < MAXIMUM_ATTEMPTS; attempt++) {
        const before = await geometry(scene);
        const screenshot = await captureBrowserScreenshot(page, {
          path: `${siteConfig.output}/${scene.id}.png`,
          expectedDpr: 1,
          metadataPath: null,
        });
        const after = await geometry(scene);
        const stable = JSON.stringify(before) === JSON.stringify(after);
        identical = stable && previous === screenshot.sha256 ? identical + 1 : 1;
        previous = screenshot.sha256;
        if (stable && identical >= IDENTICAL_CAPTURES) {
          entry = {
            id: scene.id,
            runId: siteConfig.runId,
            file: `${scene.id}.png`,
            contract: scene,
            screenshot,
            regions: after,
            platform: state.platform,
            path: state.path,
          };
          break;
        }
      }
      if (!entry) throw Error(`${scene.id}: stable native capture could not be obtained.`);
      if (scene.page.action === "feature") {
        await page.keyboard.press("Escape");
        await page.waitForSelector('[role="dialog"]', {
          state: "hidden",
          timeout: siteConfig.timeout,
        });
        const path = await page.evaluate(() => location.pathname + location.search);
        if (path !== scene.page.path)
          throw Error("Closing a feature window changed the page route.");
      }
      cases.push(entry);
      await fs.writeFile(`${siteConfig.output}/${scene.id}.json`, JSON.stringify(entry, null, 2));
      console.log(`SITE_CAPTURE_SCENE:${scene.id}:${cases.length}/${siteConfig.scenes.length}`);
    } finally {
      await page.cdp("Network.setBlockedURLs", { urls: [] });
      await page.cdp("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: initialization.identifier,
      });
    }
  }
  console.log(`SITE_CAPTURE_REPORT:${JSON.stringify({ browser, cases })}`);
} finally {
  await page.cdp("Network.setCacheDisabled", { cacheDisabled: false });
}
