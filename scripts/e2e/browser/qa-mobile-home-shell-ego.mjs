// Run with ego-browser nodejs. Set globalThis.mobileHomeQA = { root, space?, url? }.
// Home and editor tabs share the narrow workspace; only its central content changes.
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const config = globalThis.mobileHomeQA ?? {};
if (!config.root) throw Error("Set mobileHomeQA.root to the repository directory.");
await fs.mkdir(`${config.root}/.tmp`, { recursive: true });
const resumed = !!config.space;
const task = await taskSpace(resumed ? Number(config.space) : "Mobile Home workspace regression");
const page = task.page("p1");
const shell = () =>
  page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    return {
      path: location.pathname,
      top: rect(".xse-touch-top-tools"),
      options: rect(".xse-touch-context-wrap"),
      rail: rect(".xse-touch-shortcut-rail"),
      tabs: rect(".xse-touch-main .xse-tab-strip"),
      dock: rect(".xse-workspace-panel-dock"),
      panel: rect("[data-workspace-panel-pane]"),
      center: rect("[data-workspace-canvas-dock]"),
      status: rect(".xse-status"),
      activePanel: document.querySelector('.xse-workspace-panel-tabs [aria-selected="true"]')
        ?.dataset.uiTabValue,
      homeInsideCenter: !!document.querySelector("[data-workspace-canvas-dock] .xse-home"),
      spriteCanvas: !!document.querySelector('canvas[aria-label="Sprite canvas"]'),
      page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    };
  });
const nodeIdentity = () =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.__mobileHomeShell ?? {}).map(([name, node]) => [
        name,
        node ===
          document.querySelector(
            {
              top: ".xse-touch-top-tools",
              options: ".xse-touch-context-wrap",
              rail: ".xse-touch-shortcut-rail",
              tabs: ".xse-touch-main .xse-tab-strip",
              dock: ".xse-workspace-panel-dock",
              status: ".xse-status",
            }[name],
          ),
      ]),
    ),
  );
const allSame = (value) => assert.ok(Object.values(value).every(Boolean), JSON.stringify(value));

try {
  await page.goto(config.url ?? "http://127.0.0.1:5173/editor");
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.reload();
  await page.waitForSelector(".xse-workspace-panel-dock");
  const before = await shell();
  assert.equal(before.spriteCanvas, true);
  await page.evaluate(() => {
    window.__mobileHomeShell = Object.fromEntries(
      Object.entries({
        top: ".xse-touch-top-tools",
        options: ".xse-touch-context-wrap",
        rail: ".xse-touch-shortcut-rail",
        tabs: ".xse-touch-main .xse-tab-strip",
        dock: ".xse-workspace-panel-dock",
        status: ".xse-status",
      }).map(([name, selector]) => [name, document.querySelector(selector)]),
    );
  });

  await page.click('[data-ui-tab-value="home"]');
  await page.waitForURL("**/home");
  await page.waitForSelector(".xse-home .xse-home-face");
  const home = await shell();
  allSame(await nodeIdentity());
  for (const key of ["top", "options", "rail", "tabs", "dock", "panel", "center", "status"])
    assert.deepEqual(home[key], before[key], `${key} shifted on Home.`);
  assert.equal(home.homeInsideCenter, true);
  assert.equal(home.spriteCanvas, false);
  assert.deepEqual(home.page, [390, 844]);
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll(".xse-home .xse-workspace-link-workspace").length >= 3,
    ),
    true,
    "New, Open and Recover remain available in the narrow Home content.",
  );

  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="timeline"]');
  const documentId = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          ".xse-touch-main .xse-tab-strip:not(.xse-workspace-panel-tabs) [data-ui-tab-value]",
        ),
      ].find((tab) => tab.dataset.uiTabValue !== "home")?.dataset.uiTabValue,
  );
  assert.ok(documentId);
  await page.click(
    `.xse-touch-main .xse-tab-strip:not(.xse-workspace-panel-tabs) [data-ui-tab-value="${documentId}"]`,
  );
  await page.waitForURL("**/editor");
  const editor = await shell();
  allSame(await nodeIdentity());
  assert.equal(editor.activePanel, "timeline");
  assert.equal(editor.spriteCanvas, true);
  assert.equal(editor.homeInsideCenter, false);
  await page.click('[data-ui-tab-value="home"]');
  await page.waitForURL("**/home");
  assert.equal((await shell()).activePanel, "timeline");
  allSame(await nodeIdentity());

  await page.goto("http://127.0.0.1:5173/home");
  await page.waitForSelector("[data-workspace-canvas-dock] .xse-home");
  const direct = await shell();
  assert.ok(direct.top && direct.options && direct.rail && direct.dock && direct.status);
  assert.deepEqual(direct.page, [390, 844]);
  await page.click(".xse-home .xse-workspace-link-workspace >> nth=0");
  await page.waitForSelector('[role="dialog"][aria-label="新建精灵"]');

  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await page.reload();
  await page.waitForSelector("[data-workspace-canvas-dock] .xse-home");
  const landscape = await shell();
  assert.ok(
    landscape.top && landscape.options && landscape.rail && landscape.dock && landscape.status,
  );
  assert.deepEqual(landscape.page, [844, 390]);

  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.reload();
  await page.waitForSelector(".xse-home");
  const desktop = await shell();
  assert.equal(desktop.top, undefined);
  assert.equal(desktop.rail, undefined);
  assert.equal(desktop.dock, undefined);
  assert.ok(desktop.tabs);
  assert.equal(desktop.center, undefined);
  await fs.writeFile(
    `${config.root}/.tmp/qa-mobile-home-shell.json`,
    JSON.stringify(
      {
        passed: true,
        portrait: home,
        landscape,
        desktop: { path: desktop.path, page: desktop.page },
      },
      null,
      2,
    ),
  );
  console.log({
    passed: true,
    sharedNodes: 6,
    portrait: home.page,
    landscape: landscape.page,
    desktop: desktop.page,
  });
} finally {
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  if (!resumed) await task.finish({ keep: [] });
}
