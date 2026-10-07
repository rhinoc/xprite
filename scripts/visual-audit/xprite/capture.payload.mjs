// Executed by ego-browser nodejs; the wrapper supplies captureConfig.
const fs = await import("node:fs/promises");
const config = captureConfig;
const { captureBrowserScreenshot } = await import(config.screenshotModule);
const task = await taskSpace(config.spaceId ?? "Xprite visual regression");
if (task.ownership !== "agent") throw Error("Capture requires an agent-owned task space.");
console.log(`CAPTURE_SPACE:${task.spaceId}`);
const page = task.page("p1");
const cases = [];
let browser;
let currentScene;
const exampleButton = `button[aria-label=${JSON.stringify(config.sampleName)}]`;
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready;
  });
const parkedPointer = async (width, height) => {
  await page.mouse.move(width - 1, height - 1, { label: "clear pointer hover before capture" });
  // Blur editable controls through the public DOM to avoid blinking carets.
  await page.evaluate(() => {
    if (document.activeElement?.matches("input, textarea, [contenteditable=true]"))
      document.activeElement.blur();
  });
  await page.waitForSelector('[role="tooltip"]', { state: "hidden" });
};

try {
  for (const language of config.languages) {
    const selected = new Set(config.selectedIds[language]);
    if (!selected.size) continue;
    await fs.mkdir(`${config.output}/${language}`, { recursive: true });
    await fs.mkdir(`${config.output}/ready/${language}`, { recursive: true });
    const catalog = config.catalogs[language];
    const text = (key, values = {}) => {
      if (!catalog[key]) throw Error(`Missing ${language} capture label: ${key}`);
      return catalog[key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
    };
    const keys = {
      home: "ui.home",
      recents: "ui.recent.files",
      recovery: "ui.recover.files",
      recoverAction: "ui.recover.files.6d880af2",
      canvas: "ui.sprite.canvas",
      currentFrame: "ui.current.frame",
      zoom: "ui.zoom",
      preferences: "ui.preferences",
      cancel: "ui.cancel",
      edit: "ui.edit",
      menu: "ui.menu",
      newSprite: "ui.new.sprite",
      saveAs: "ui.save.as",
      exportFile: "ui.export.file",
      exportAction: "ui.export",
      gifOptions: "ui.gif.options",
      foreground: "ui.foreground.color.c5308777",
      restoreColor: "ui.restore.original.color",
      pencil: "ui.pencil",
      layerProperties: "ui.layer.properties",
      palette: "ui.palette",
      tools: "ui.tools",
      context: "ui.context",
    };
    const ui = Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, text(key)]));
    ui.pin = text("ui.action.name", { action: text("ui.pin"), name: config.sampleName });
    ui.delete = text("ui.home.delete.browser.copy.name", { name: config.sampleName });
    ui.closeRecovery = text("ui.close.name", { name: ui.recovery });
    ui.foregroundWhite = text("ui.foreground.color.color", { color: "#FFFFFF" });
    const labeled = (selector, label) => `${selector}[aria-label=${JSON.stringify(label)}]`;
    for (const { mode, width, height } of config.layouts) {
      if (![...selected].some((id) => id.endsWith(`-${mode}`))) continue;
      currentScene = { language, id: `home-${mode}`, view: "home", mode, width, height };
      const origin = `http://xprite-visual-${mode}-${language.toLowerCase()}.localhost:${config.port}`;
      await page.goto("about:blank");
      await page.cdp("Storage.clearDataForOrigin", {
        origin,
        storageTypes: "local_storage,indexeddb",
      });
      await page.cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.cdp("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "light" }],
      });
      const initialization = await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
        source: `if (location.origin === ${JSON.stringify(origin)}) {
      localStorage.setItem("xse.ui.language.v1", ${JSON.stringify(language)});
      localStorage.setItem("xse.ui.appearance-mode.v1", "light");
      localStorage.setItem("xse.layout.workspace-panel-selection.v3", ${JSON.stringify(JSON.stringify({ mode }))});
      // Freeze only Vite's development transport; application sockets and timers stay native.
      const NativeSocket = window.WebSocket;
      window.WebSocket = new Proxy(NativeSocket, {
        construct(target, args, newTarget) {
          const protocols = Array.isArray(args[1]) ? args[1] : [args[1]];
          if (!protocols.includes("vite-hmr")) return Reflect.construct(target, args, newTarget);
          const socket = new EventTarget();
          socket.readyState = NativeSocket.OPEN;
          socket.url = String(args[0]);
          socket.send = () => {};
          socket.close = () => {};
          queueMicrotask(() => socket.dispatchEvent(new Event("open")));
          setTimeout(() => socket.dispatchEvent(new MessageEvent("message", { data: '{"type":"connected"}' })), 0);
          return socket;
        },
      });
    }`,
      });
      const capture = async (view, target) => {
        const id = `${view}-${mode}`;
        currentScene = { language, id, view, mode, width, height };
        if (!selected.has(id)) return;
        await page.waitForSelector(target, { state: "visible", timeout: 30000 });
        await page.waitForFunction(
          () =>
            document.fonts.status === "loaded" &&
            [...document.images].every((image) => image.complete),
        );
        await settle();
        const metadata = await page.evaluate(
          ({ width, height, view, mode, target, sampleName, ui, language }) => {
            const labeled = (selector, label) => `${selector}[aria-label=${JSON.stringify(label)}]`;
            if (document.documentElement.lang !== language) throw Error("Wrong UI language.");
            if (innerWidth !== width || innerHeight !== height || devicePixelRatio !== 1)
              throw Error("Unexpected viewport or device scale.");
            if (!!document.querySelector(".xse-compact-editor-layout") !== (mode === "compact"))
              throw Error("Wrong workspace layout mode.");
            const selectors = {
              tabs: ".xse-fixed-document-header",
              status: ".xse-status",
              ...(view === "home"
                ? {
                    home: labeled("section", ui.home),
                    recents: labeled('[role="group"]', ui.recents),
                    "recent-row": `button[aria-label=${JSON.stringify(sampleName)}]`,
                    pin: `button[aria-label=${JSON.stringify(ui.pin)}]`,
                    delete: `button[aria-label=${JSON.stringify(ui.delete)}]`,
                  }
                : view === "recovery"
                  ? {
                      home: labeled("section", ui.home),
                    }
                  : {
                      canvas: labeled("canvas", ui.canvas),
                      timeline: '[data-ui-region="timeline"]',
                      palette: labeled('[role="tabpanel"]', ui.palette),
                      tools: labeled('[role="tabpanel"]', ui.tools),
                      context: labeled('[role="tabpanel"]', ui.context),
                    }),
              ...(!["home", "editor"].includes(view) ? { [view]: target } : {}),
              ...(view === "edit-menu" && mode === "compact"
                ? { "application-menu": labeled('[role="menu"]', ui.menu) }
                : {}),
            };
            const regions = Object.entries(selectors).flatMap(([name, selector]) => {
              const rect = document.querySelector(selector)?.getBoundingClientRect();
              if (!rect || rect.width <= 0 || rect.height <= 0) return [];
              const x = Math.max(0, Math.floor(rect.x)),
                y = Math.max(0, Math.floor(rect.y));
              const right = Math.min(width, Math.ceil(rect.right)),
                bottom = Math.min(height, Math.ceil(rect.bottom));
              return right > x && bottom > y
                ? [{ name, x, y, width: right - x, height: bottom - y }]
                : [];
            });
            if (!["home", "editor"].includes(view) && !regions.some(({ name }) => name === view))
              throw Error(`${view}: missing captured target region.`);
            const overlay = document.querySelector(target);
            if (overlay?.matches('[role="dialog"]')) {
              const rect = overlay.getBoundingClientRect();
              const tolerance = 1;
              if (
                rect.left < -tolerance ||
                rect.top < -tolerance ||
                rect.right > width + tolerance ||
                rect.bottom > height + tolerance
              )
                throw Error(`${view}: dialog extends beyond the viewport.`);
              for (const client of overlay.querySelectorAll(
                "[data-window-client], [data-ui-window-client]",
              )) {
                if (client.scrollWidth > client.clientWidth + tolerance)
                  throw Error(`${view}: dialog requires horizontal scrolling.`);
                if (
                  view === "color-picker" &&
                  client.scrollHeight > client.clientHeight + tolerance
                )
                  throw Error(`${view}: color controls are clipped vertically.`);
              }
            }
            return {
              url: location.href,
              mode,
              view,
              viewport: { width, height, dpr: devicePixelRatio },
              language: document.documentElement.lang,
              hmr: "isolated-vite-transport",
              frame: document.querySelector(labeled("input", ui.currentFrame))?.value,
              zoom: document.querySelector(labeled("input", ui.zoom))?.value,
              regions,
              ...(view === "tooltip"
                ? { tooltip: document.querySelector(target)?.getAttribute("aria-label") }
                : {}),
            };
          },
          { width, height, view, mode, target, sampleName: config.sampleName, ui, language },
        );
        const file = `${config.output}/${language}/${id}.png`;
        let previousHash,
          stable = false;
        let identicalCaptures = 0;
        const requiredIdenticalCaptures = 2;
        const maximumCaptureAttempts = 12;
        for (let attempt = 0; attempt < maximumCaptureAttempts; attempt++) {
          await settle();
          const screenshot = await captureBrowserScreenshot(page, {
            path: file,
            expectedDpr: 1,
            metadataPath: null,
          });
          const hash = screenshot.sha256;
          identicalCaptures = hash === previousHash ? identicalCaptures + 1 : 1;
          if (identicalCaptures >= requiredIdenticalCaptures) {
            await page.waitForSelector(target, { state: "visible", timeout: 3000 });
            browser ??= await page.evaluate(() => ({
              userAgent: navigator.userAgent,
              platform: navigator.platform,
            }));
            const entry = { id, file: `${id}.png`, sha256: hash, screenshot, ...metadata };
            cases.push(entry);
            const readyFile = `${config.output}/ready/${language}/${id}.json`;
            await fs.writeFile(`${readyFile}.pending`, JSON.stringify({ browser, entry }));
            await fs.rename(`${readyFile}.pending`, readyFile);
            stable = true;
            break;
          }
          previousHash = hash;
        }
        if (!stable) throw Error(`${id}: screenshots did not stabilize.`);
        console.log(`CAPTURE_CASE:${language}/${id}`);
      };
      const closeDialog = async (label) => {
        await page.click(
          `[role="dialog"][aria-label=${JSON.stringify(label)}] button[aria-label=${JSON.stringify(text("ui.close.name", { name: label }))}]`,
        );
        await page.waitForSelector(`[role="dialog"][aria-label=${JSON.stringify(label)}]`, {
          state: "hidden",
        });
        await settle();
        await page.waitForSelector(labeled("canvas", ui.canvas));
      };

      await page.goto(`${origin}/home`);
      await page.waitForSelector(exampleButton, { timeout: 30000 });
      await page.hover(exampleButton, { label: "highlight example recent file" });
      await page.waitForSelector(`button[aria-label=${JSON.stringify(ui.pin)}]`);
      await capture("home", labeled("section", ui.home));
      await parkedPointer(width, height);

      if (selected.has(`recovery-${mode}`)) {
        await page.click(labeled("button", ui.recoverAction));
        await page.waitForSelector(labeled("section", ui.recovery));
        await page.waitForFunction(
          (selector) => document.querySelector(selector)?.getAttribute("aria-busy") === "false",
          labeled("section", ui.recovery),
        );
        await parkedPointer(width, height);
        await capture("recovery", labeled("section", ui.recovery));
        await page.click('[role="tab"][data-ui-tab-value="home"]');
        await page.click(labeled("button", ui.closeRecovery));
        await page.waitForSelector(exampleButton);
      }
      if (
        !config.scenes.some(
          (view) => !["home", "recovery"].includes(view) && selected.has(`${view}-${mode}`),
        )
      ) {
        await page.cdp("Page.removeScriptToEvaluateOnNewDocument", initialization);
        continue;
      }

      await page.click(exampleButton);
      await page.waitForSelector(labeled("canvas", ui.canvas), { timeout: 30000 });
      await page.waitForFunction(
        (selector) => document.querySelector(selector)?.value === "1",
        labeled("input", ui.currentFrame),
      );
      await page.fill(labeled("input", ui.zoom), "400");
      await page.press(labeled("input", ui.zoom), "Enter");
      await parkedPointer(width, height);
      await capture("editor", labeled("canvas", ui.canvas));

      if (selected.has(`preferences-${mode}`)) {
        await page.keyboard.press("ControlOrMeta+k");
        await page.waitForSelector(labeled('[role="dialog"]', ui.preferences));
        await parkedPointer(width, height);
        await capture("preferences", labeled('[role="dialog"]', ui.preferences));
        await page.click(
          `${labeled('[role="dialog"]', ui.preferences)} ${labeled("button", ui.cancel)}`,
        );
        await page.waitForSelector('[role="dialog"]', { state: "hidden" });
        await settle();
        await page.waitForSelector(labeled("canvas", ui.canvas));
      }
      if (selected.has(`edit-menu-${mode}`)) {
        if (mode === "compact") {
          await page.click('[data-touch-action="Menu"]');
          await page.hover(labeled('[role="menuitem"]', ui.edit), {
            label: "open compact Edit submenu",
          });
        } else await page.click(labeled('[role="menuitem"]', ui.edit));
        await capture("edit-menu", labeled('[role="menu"]', ui.edit));
        await page.keyboard.press("Escape");
        if (mode === "compact") await page.keyboard.press("Escape");
        await page.waitForSelector('[role="menu"]', { state: "hidden" });
        await parkedPointer(width, height);
      }
      for (const [view, shortcut, label] of [
        ["new-sprite", "ControlOrMeta+n", ui.newSprite],
        ["save-as", "ControlOrMeta+Shift+s", ui.saveAs],
      ]) {
        if (!selected.has(`${view}-${mode}`)) continue;
        await page.keyboard.press(shortcut);
        await page.waitForSelector(`[role="dialog"][aria-label=${JSON.stringify(label)}]`);
        await parkedPointer(width, height);
        await capture(view, `[role="dialog"][aria-label=${JSON.stringify(label)}]`);
        await closeDialog(label);
      }
      if (selected.has(`export-file-${mode}`) || selected.has(`gif-options-${mode}`)) {
        await page.keyboard.press("ControlOrMeta+Alt+Shift+s");
        await page.waitForSelector(labeled('[role="dialog"]', ui.exportFile));
        await parkedPointer(width, height);
        await capture("export-file", labeled('[role="dialog"]', ui.exportFile));
        if (selected.has(`gif-options-${mode}`)) {
          await page.click(
            `${labeled('[role="dialog"]', ui.exportFile)} ${labeled("button", ui.exportAction)}`,
          );
          await page.waitForSelector(labeled('[role="dialog"]', ui.gifOptions));
          await parkedPointer(width, height);
          await capture("gif-options", labeled('[role="dialog"]', ui.gifOptions));
          await closeDialog(ui.gifOptions);
        } else await closeDialog(ui.exportFile);
      }
      if (selected.has(`color-picker-${mode}`)) {
        await page.click(labeled("button", ui.foregroundWhite));
        await page.waitForSelector(labeled('[role="dialog"]', ui.foreground));
        await page.focus(
          `${labeled('[role="dialog"]', ui.foreground)} ${labeled("button", ui.restoreColor)}`,
        );
        await parkedPointer(width, height);
        await capture("color-picker", labeled('[role="dialog"]', ui.foreground));
        await page.keyboard.press("Escape");
        await page.waitForSelector(labeled('[role="dialog"]', ui.foreground), { state: "hidden" });
        await settle();
      }
      if (selected.has(`tooltip-${mode}`)) {
        await parkedPointer(width, height);
        await page.hover(labeled("button", ui.pencil), { label: "show Pencil tool tooltip" });
        await page.waitForSelector('[role="tooltip"]');
        await capture("tooltip", '[role="tooltip"]');
        await parkedPointer(width, height);
      }
      if (selected.has(`layer-properties-${mode}`)) {
        await page.keyboard.press("Shift+p");
        await page.waitForSelector(labeled('[role="dialog"]', ui.layerProperties));
        await parkedPointer(width, height);
        await capture("layer-properties", labeled('[role="dialog"]', ui.layerProperties));
        await closeDialog(ui.layerProperties);
      }
      await page.cdp("Page.removeScriptToEvaluateOnNewDocument", initialization);
    }
  }
  browser ??= await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  }));
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  if (!config.spaceId) await task.finish({ keep: [] });
  console.log(`XPRITE_CAPTURE_REPORT:${JSON.stringify({ browser, cases })}`);
} catch (error) {
  try {
    const screenshot = await captureBrowserScreenshot(page, {
      path: `${config.output}/capture-failure.png`,
      expectedDpr: 1,
      metadataPath: null,
    });
    await fs.writeFile(
      `${config.output}/capture-failure.json`,
      JSON.stringify(
        {
          error: error.message,
          scene: currentScene,
          screenshot,
        },
        null,
        2,
      ),
    );
  } catch (captureError) {
    console.error(`Failure screenshot unavailable: ${captureError.message}`);
  }
  throw error;
}
