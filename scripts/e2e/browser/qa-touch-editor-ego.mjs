// Run with ego-browser nodejs. Set globalThis.touchEditorQA = { root, space?, url? }.
// Chromium dispatches real Touch -> Pointer events; device Safari/Android remain separate checks.
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const config = globalThis.touchEditorQA ?? {};
if (!config.root) throw Error("Set touchEditorQA.root to the repository directory.");
await fs.mkdir(`${config.root}/.tmp`, { recursive: true });
const resumed = !!config.space;
const task = await taskSpace(resumed ? Number(config.space) : "Touch editor regression");
const page = task.page("p1");
const results = [];
const record = (name, data) => {
  results.push({ name, data });
  console.log(name, data);
};
const touch = (type, points) => page.cdp("Input.dispatchTouchEvent", { type, touchPoints: points });
const point = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
const tap = async (x, y, id) => {
  await touch("touchStart", [point(x, y, id)]);
  await touch("touchEnd", []);
};
const center = (selector) =>
  page.evaluate((selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return (
      rect && {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        width: rect.width,
        height: rect.height,
      }
    );
  }, selector);
const tapSelector = async (selector, id) => {
  const target = await center(selector);
  await tap(target.x, target.y, id);
};
const panelTabs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".xse-workspace-panel-tabs [data-ui-tab-value]")].map(
      (el) => el.dataset.uiTabValue,
    ),
  );

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
  await page.waitForFunction(
    () =>
      document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement ===
        "stacked" && !!document.querySelector('canvas[aria-label="Sprite canvas"]'),
  );
  const layout = await page.evaluate(() => {
    const r = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    return {
      top: r(".xse-touch-top-tools")?.height,
      rail: r(".xse-touch-shortcut-rail")?.width,
      topBottom: r(".xse-touch-top-tools")?.bottom,
      optionsTop: r(".xse-touch-context-wrap")?.top,
      optionsHeight: r(".xse-touch-context-wrap")?.height,
      optionsBottom: r(".xse-touch-context-wrap")?.bottom,
      documentTabsTop: r(".xse-touch-main .xse-tab-strip")?.top,
      brush: r('input[aria-label="笔刷大小"],input[aria-label="Brush size"]')?.toJSON(),
      contextCount: document.querySelectorAll(".xse-context").length,
      tabs: [...document.querySelectorAll('.xse-workspace-panel-tabs [role="tab"]')].map((el) =>
        el.getAttribute("aria-label"),
      ),
      canvas: [
        r('canvas[aria-label="Sprite canvas"]')?.width,
        r('canvas[aria-label="Sprite canvas"]')?.height,
      ],
      dock: r(".xse-workspace-panel-dock")?.height,
      status: getComputedStyle(document.querySelector(".xse-status")).display,
      page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    };
  });
  assert.deepEqual(layout.page, [390, 844]);
  assert.ok(
    layout.top >= 40 && layout.rail >= 40 && layout.canvas[0] >= 300 && layout.canvas[1] >= 300,
  );
  assert.equal(layout.optionsHeight, 36);
  assert.equal(layout.optionsTop, layout.topBottom);
  assert.equal(layout.documentTabsTop, layout.optionsBottom);
  assert.ok(
    layout.brush.left >= 0 && layout.brush.right <= 390,
    "The Xprite brush size input is visible in the row below tools.",
  );
  assert.equal(layout.contextCount, 1);
  assert.deepEqual(layout.tabs, ["调色板", "时间轴", "取色器", "瓦片集"]);
  assert.equal(layout.status, "flex");
  record("Reference composition and Xprite lower tabs", layout);
  const brushInput = 'input[aria-label="笔刷大小"],input[aria-label="Brush size"]';
  await page.fill(brushInput, "7");
  await page.press(brushInput, "Enter");
  await page.click('[data-touch-tool-group="Eraser"]');
  await page.click('[data-touch-tool-group="Pencil"]');
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('input[aria-label="笔刷大小"],input[aria-label="Brush size"]')
          ?.value,
    ),
    "7",
    "The visible Xprite size control keeps the pencil setting after changing tools.",
  );
  await page.fill(brushInput, "1");
  await page.press(brushInput, "Enter");
  record("The existing brush size row edits and remembers tool settings", { size: 7 });
  const toolGroups = await page.evaluate(() =>
    [...document.querySelectorAll("[data-touch-tool-group]")].map(
      (button) => button.dataset.touchToolGroup,
    ),
  );
  assert.equal(toolGroups.length, 12, "The top toolbar shows one face for each source tool group.");
  await tapSelector('[data-touch-tool-group="Selection"]', 40);
  assert.equal(
    await page.evaluate(() => document.querySelectorAll('[role="menu"]').length),
    0,
    "One tap selects the group tool.",
  );
  await tapSelector('[data-touch-tool-group="Selection"]', 41);
  await page.waitForFunction(
    () => !!document.querySelector('[role="menu"][aria-label="选区 工具"]'),
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-touch-tool-options="Selection"] [data-touch-tool-option]',
        ),
      ].map((button) => button.dataset.touchToolOption),
    ),
    ["marquee", "elliptical_marquee", "lasso", "polygonal_lasso", "magic_wand"],
  );
  await tapSelector('[data-touch-tool-option="elliptical_marquee"]', 43);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-touch-tool-group="Selection"]')?.dataset.touchTool,
    ),
    "elliptical_marquee",
  );
  await page.click('[data-touch-tool-group="Pencil"]');
  await page.click('[data-touch-tool-group="Selection"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-touch-tool-group="Selection"]')?.dataset.touchTool,
    ),
    "elliptical_marquee",
    "Group selection remembers its prior secondary tool.",
  );
  assert.equal(
    await page.evaluate(() => document.querySelectorAll("[data-touch-tool-options]").length),
    0,
    "Selecting a different group keeps its choices collapsed.",
  );
  await page.click('[data-touch-tool-group="Selection"]');
  await page.waitForFunction(
    () => !!document.querySelector('[data-touch-tool-options="Selection"]'),
  );
  await page.keyboard.press("Escape");
  record("Horizontal source tool groups open icon choices on a selected-tool click", {
    toolGroups,
  });
  const fullStrip = await page.evaluate(() => ({
    width: document.querySelector(".xse-workspace-panel-tabs")?.clientWidth,
    content: document.querySelector(".xse-workspace-panel-tabs")?.scrollWidth,
    layoutButton: !!document.querySelector(".xse-workspace-panel-layout-button"),
  }));
  assert.ok(
    fullStrip.content <= fullStrip.width + 1 && !fullStrip.layoutButton,
    "The four lower tabs fit directly without an extra layout button.",
  );
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 568,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement ===
        "stacked" && !!document.querySelector(".xse-workspace-panel-tabs"),
  );
  const lowerStrip = await center('.xse-workspace-panel-tabs [data-ui-tab-value="palette"]');
  await touch("touchStart", [point(lowerStrip.x, lowerStrip.y, 30)]);
  await touch("touchMove", [point(lowerStrip.x - 80, lowerStrip.y, 30)]);
  await touch("touchEnd", []);
  const tabScroll = await page.evaluate(
    () => document.querySelector(".xse-workspace-panel-tabs")?.scrollLeft,
  );
  assert.ok(tabScroll > 0, "A short swipe scrolls the Xprite tab strip instead of reordering it.");
  assert.deepEqual(await panelTabs(), ["palette", "timeline", "picker", "tileset"]);
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement ===
        "stacked" && !!document.querySelector(".xse-workspace-panel-tabs"),
  );
  const canvasBeforeMenu = await page.evaluate(
    () =>
      document.querySelector('canvas[aria-label="Sprite canvas"]')?.getBoundingClientRect().height,
  );
  await tapSelector('[data-touch-action="Menu"]', 31);
  const rootMenu = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"][aria-label="菜单"] [role="menuitem"]')].map(
      (item) => item.getAttribute("aria-label"),
    ),
  );
  assert.deepEqual(rootMenu, ["文件", "编辑", "精灵", "图层", "帧", "选择", "视图"]);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('canvas[aria-label="Sprite canvas"]')?.getBoundingClientRect()
          .height,
    ),
    canvasBeforeMenu,
  );
  await tapSelector('[role="menu"][aria-label="菜单"] [role="menuitem"][aria-label="文件"]', 32);
  await tapSelector('[role="menu"][aria-label="文件"] [role="menuitem"][aria-label="新建..."]', 33);
  await page.waitForFunction(
    () =>
      !!document.querySelector('[role="dialog"][aria-label="新建精灵"] button[aria-label="透明"]'),
  );
  record("Direct lower tabs, narrow swipe and one-tap root menu", {
    fullStrip,
    tabScroll,
    rootMenu,
  });

  assert.ok(
    await page.evaluate(() => !!document.querySelector('[data-touch-action="NewFile"]')),
    "The left rail retains its new-file shortcut.",
  );
  for (const label of ["Width", "Height"]) {
    await page.focus(
      `input[aria-label="${label}"],input[aria-label="${label === "Width" ? "宽度" : "高度"}"]`,
    );
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("16");
    await page.waitForFunction((source) => {
      const localized = source === "Width" ? "宽度" : "高度";
      const field = document.querySelector(
        `input[aria-label="${source}"],input[aria-label="${localized}"]`,
      );
      return (
        field?.value === "16" &&
        !!document.querySelector('[role="dialog"][aria-label="新建精灵"] button[aria-label="透明"]')
      );
    }, label);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }
  await page.click('button[aria-label="Transparent"],button[aria-label="透明"]');
  await page.click('button[aria-label="OK"],button[aria-label="确定"]');
  await page.waitForFunction(() => document.querySelectorAll("[data-palette-index]").length >= 32);
  await page.evaluate(() => {
    localStorage.setItem("xse.debug.input-log.v1", "1");
    window.__asepriteDebugLog = [];
  });
  const swatch = await center('[data-palette-index="8"]');
  assert.deepEqual(
    [swatch.width, swatch.height],
    [22, 22],
    "Palette swatches retain the source desktop cell size.",
  );
  await tap(swatch.x, swatch.y, 1);
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('[data-palette-index="8"]')?.getAttribute("aria-selected"),
    ),
    "true",
  );
  record("Palette touch target and color selection", swatch);

  const canvas = await center('canvas[aria-label="Sprite canvas"]');
  await tap(canvas.x - 3, canvas.y - 3, 2);
  await tap(canvas.x + 3, canvas.y + 3, 3);
  const revisions = await page.evaluate(() =>
    (window.__asepriteDebugLog ?? [])
      .filter((item) => item.kind === "after-pointerup" && item.pointerType === "touch")
      .map((item) => item.extra?.pixelRevision),
  );
  assert.ok(
    revisions.length >= 2 && revisions.at(-1) > revisions.at(-2),
    "Finger taps commit distinct pixels.",
  );
  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="picker"]');
  assert.ok(
    (await center(".xse-colorbar")).width >= 300,
    "The source color picker fills its dock tab.",
  );
  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="palette"]');
  await tapSelector('[data-palette-index="9"]', 44);
  await touch("touchStart", [point(canvas.x - 3, canvas.y - 3, 4)]);
  await page.waitForTimeout(520);
  await touch("touchEnd", []);
  await tapSelector('[data-palette-index="9"]', 45);
  await tapSelector('[data-palette-index="9"]', 46);
  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="picker"]');
  const picked = await page.evaluate(() => ({
    foreground: document
      .querySelector('button[aria-label^="Foreground color:"],button[aria-label^="前景色："]')
      ?.getAttribute("aria-label"),
    background: document
      .querySelector('button[aria-label^="Background color:"],button[aria-label^="背景色："]')
      ?.getAttribute("aria-label"),
  }));
  assert.ok(
    picked.foreground?.toLowerCase().includes("fbf236"),
    "Stationary long press samples the first painted color and palette double-tap preserves it.",
  );
  assert.ok(
    picked.background?.toLowerCase().includes("99e550"),
    "Palette double-tap performs the source right-click background action.",
  );
  record("Canvas paint, long-press eyedropper and palette double-tap", { revisions, picked });

  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="timeline"]');
  await page.waitForFunction(
    () => !!document.querySelector(".xse-workspace-panel-content .xse-timeline"),
  );
  const timeline = await page.evaluate(() => {
    const pane = document.querySelector(".xse-timeline-frame-pane")?.getBoundingClientRect();
    const frame = document.querySelector('[data-timeline-kind="frames"]')?.getBoundingClientRect();
    return { paneWidth: pane?.width, frameWidth: frame?.width, frameHeight: frame?.height };
  });
  assert.ok(
    timeline.paneWidth >= 100 && timeline.frameWidth === 24 && timeline.frameHeight === 24,
    "Timeline cells retain the source desktop size.",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(".xse-touch-timeline-header button,.xse-touch-timeline-more")
          .length,
    ),
    0,
  );
  for (let i = 0; i < 3; i++)
    await page.click('button[aria-label="Add frame"],button[aria-label="添加帧"]');
  await page.click('button[aria-label="First frame"],button[aria-label="第一帧"]');
  const frame = await center('[data-timeline-kind="frames"][data-frame="0"]');
  await tap(frame.x, frame.y, 5);
  await tap(frame.x, frame.y, 6);
  await page.waitForFunction(
    () => !!document.querySelector('[role="menu"][aria-label="时间轴菜单"]'),
  );
  assert.ok(
    await page.evaluate(() => !!document.querySelector('[role="menuitem"][aria-label="新建帧"]')),
  );
  await page.click('[role="menuitem"][aria-label="选择范围"]');
  await tapSelector('[data-timeline-kind="frames"][data-frame="2"]', 47);
  const selectedFrames = await page.evaluate(() =>
    [...document.querySelectorAll('[data-timeline-kind="frames"][aria-pressed="true"]')].map((el) =>
      Number(el.dataset.frame),
    ),
  );
  assert.deepEqual(
    selectedFrames.filter((index) => index <= 2),
    [0, 1, 2],
  );
  await tapSelector('[data-timeline-kind="frames"][data-frame="2"]', 48);
  await page.click('[role="menuitem"][aria-label="完成"]');
  await tap(frame.x, frame.y, 59);
  await page.waitForTimeout(430);
  await tap(frame.x, frame.y, 60);
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[role="menu"][aria-label="时间轴菜单"]').length,
    ),
    0,
    "Slow repeated taps keep their selection behavior.",
  );
  record("Timeline double-tap opens the source context menu and range selection", {
    ...timeline,
    selectedFrames,
  });

  await page.click('[data-touch-tool-group="Move"]');
  await page.click('[data-touch-tool-group="Move"]');
  await page.click('[data-touch-tool-option="slice"]');
  await touch("touchStart", [point(canvas.x - 10, canvas.y - 10, 54)]);
  await touch("touchMove", [point(canvas.x + 10, canvas.y + 10, 54)]);
  await touch("touchEnd", []);
  await tap(canvas.x, canvas.y, 55);
  await tap(canvas.x, canvas.y, 56);
  await page.waitForFunction(
    () => !!document.querySelector('[role="menu"][aria-label="切片菜单"]'),
  );
  assert.equal(
    await page.evaluate(() => document.querySelectorAll(".xse-touch-slice-actions").length),
    0,
  );
  await page.keyboard.press("Escape");
  await page.click('[data-touch-tool-group="Pencil"]');
  record("Slice double-tap opens its original context actions", { menu: "切片菜单" });

  await tapSelector('[data-touch-action="Menu"]', 34);
  await tapSelector('[role="menu"][aria-label="菜单"] [role="menuitem"][aria-label="图层"]', 35);
  await tapSelector('[role="menu"][aria-label="图层"] [role="menuitem"][aria-label="新建..."]', 36);
  await tapSelector(
    '[role="menu"][aria-label="新建..."] [role="menuitem"][aria-label="新建瓦片地图图层"]',
    37,
  );
  await page.click(
    '[role="dialog"] button[aria-label="确定"],[role="dialog"] button[aria-label="OK"]',
  );
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[role="dialog"][aria-label="新建图层"],[role="dialog"][aria-label="New Layer"]',
      ),
  );
  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="tileset"]');
  const tileset = await page.evaluate(() => ({
    modeBar: !!document.querySelector(".xse-workspace-panel-content .xse-tilemap-mode-bar"),
    tiles: document.querySelectorAll(".xse-workspace-panel-content [data-tile-index]").length,
  }));
  assert.ok(
    tileset.modeBar && tileset.tiles >= 1,
    "A real tilemap layer uses the existing tileset editor inside its tab.",
  );
  await page.focus('button[aria-label="Resize tileset"]');
  await page.press('button[aria-label="Resize tileset"]', "ArrowRight");
  await page.press('button[aria-label="Resize tileset"]', "ArrowRight");
  await tapSelector('[data-tile-index="1"]', 49);
  await page.waitForTimeout(430);
  await tapSelector('[data-tile-index="2"]', 50);
  await tapSelector('[data-tile-index="2"]', 51);
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('[data-tile-index="1"]')?.getAttribute("aria-selected"),
    ),
    "true",
  );
  if (
    await page.evaluate(
      () =>
        document
          .querySelector('button[aria-label="Show Tileset"]')
          ?.getAttribute("aria-pressed") !== "true",
    )
  )
    await page.click('button[aria-label="Show Tileset"]');
  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="picker"]');
  const tileTargets = await page.evaluate(() =>
    [...document.querySelectorAll(".xse-colorbar [aria-label]")]
      .map((el) => el.getAttribute("aria-label"))
      .filter((label) => /tile/.test(label)),
  );
  assert.ok(tileTargets.includes("Foreground tile 1") && tileTargets.includes("Background tile 2"));
  await page.click('.xse-workspace-panel-tabs [data-ui-tab-value="tileset"]');
  record("Tileset double-tap reuses background tile selection", { ...tileset, tileTargets });

  await tapSelector('.xse-workspace-panel-tabs [data-ui-tab-value="palette"]', 52);
  await tapSelector('.xse-workspace-panel-tabs [data-ui-tab-value="palette"]', 53);
  await page.waitForFunction(
    () => !!document.querySelector('[role="menu"][aria-label="面板布局"]'),
  );
  await page.keyboard.press("Escape");
  record("Panel tab double-tap replaces the layout button", {
    layoutButton: await page.evaluate(
      () => !!document.querySelector(".xse-workspace-panel-layout-button"),
    ),
  });

  // The same Xprite tab strip used for documents supports long-press reordering.
  const tabsBefore = await panelTabs();
  const positions = await page.evaluate(() =>
    [...document.querySelectorAll(".xse-workspace-panel-tabs [data-ui-tab-value]")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.uiTabValue,
        x: r.x + r.width / 3,
        y: r.y + r.height / 2,
        left: r.left,
      };
    }),
  );
  const source = positions.find((item) => item.id === "picker"),
    target = positions.find((item) => item.id === "palette");
  await touch("touchStart", [point(source.x, source.y, 7)]);
  await page.waitForTimeout(520);
  await touch("touchMove", [point(target.left + 8, target.y, 7)]);
  await touch("touchEnd", []);
  const tabsAfter = await panelTabs();
  assert.equal(tabsAfter[0], "picker");
  const splitTarget = await page.evaluate(() => {
    const tab = document
      .querySelector('.xse-workspace-panel-tabs [data-ui-tab-value="timeline"]')
      .getBoundingClientRect();
    const pane = document.querySelector("[data-workspace-panel-pane]").getBoundingClientRect();
    return {
      sx: tab.x + tab.width / 3,
      sy: tab.y + tab.height / 2,
      dx: pane.right - 5,
      dy: pane.y + pane.height * 0.7,
    };
  });
  await touch("touchStart", [point(splitTarget.sx, splitTarget.sy, 8)]);
  await page.waitForTimeout(520);
  await touch("touchMove", [point(splitTarget.dx, splitTarget.dy, 8)]);
  await touch("touchEnd", []);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 2,
  );
  const splitWidth = await page.evaluate(
    () => document.querySelector("[data-workspace-panel-pane]")?.getBoundingClientRect().width,
  );
  await page.focus('.xse-workspace-panel-splitter[data-axis="horizontal"]');
  await page.press('.xse-workspace-panel-splitter[data-axis="horizontal"]', "ArrowRight");
  const resizedWidth = await page.evaluate(
    () => document.querySelector("[data-workspace-panel-pane]")?.getBoundingClientRect().width,
  );
  assert.ok(
    resizedWidth > splitWidth,
    "Panel split ratio responds to an accessible resize control.",
  );
  const dockHeight = await page.evaluate(
    () => document.querySelector("[data-workspace-panel-pane]")?.getBoundingClientRect().height,
  );
  await page.focus('.xse-workspace-panel-splitter[data-axis="vertical"]');
  await page.press('.xse-workspace-panel-splitter[data-axis="vertical"]', "ArrowUp");
  const tallerDock = await page.evaluate(
    () => document.querySelector("[data-workspace-panel-pane]")?.getBoundingClientRect().height,
  );
  assert.ok(tallerDock > dockHeight);
  await page.press('.xse-workspace-panel-splitter[data-axis="vertical"]', "ArrowDown");
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 2,
  );
  record("Xprite panel tab reorder, split, resize and persistence", {
    tabsBefore,
    tabsAfter,
    paneCount: 2,
    splitWidth,
    resizedWidth,
  });

  await tapSelector(
    '.xse-touch-main .xse-tab-strip:not(.xse-workspace-panel-tabs) [data-ui-tab-value]:not([data-ui-tab-value="home"])',
    57,
  );
  await tapSelector(
    '.xse-touch-main .xse-tab-strip:not(.xse-workspace-panel-tabs) [data-ui-tab-value]:not([data-ui-tab-value="home"])',
    58,
  );
  await page.waitForFunction(
    () => !!document.querySelector('[role="menu"][aria-label="文档标签菜单"]'),
  );
  await page.keyboard.press("Escape");
  record("Document tab double-tap reuses the right-click menu", { menu: "文档标签菜单" });

  const documentDrag = await page.evaluate(() => {
    const strip = document.querySelector(
      ".xse-touch-main .xse-tab-strip:not(.xse-workspace-panel-tabs)",
    );
    const tab = [...strip.querySelectorAll("[data-ui-tab-value]")]
      .find((el) => el.dataset.uiTabValue !== "home")
      .getBoundingClientRect();
    const pane = document.querySelector("[data-workspace-pane-id]").getBoundingClientRect();
    return {
      sx: tab.x + Math.min(36, tab.width / 3),
      sy: tab.y + tab.height / 2,
      dx: pane.right - 7,
      dy: pane.y + pane.height / 2,
    };
  });
  await touch("touchStart", [point(documentDrag.sx, documentDrag.sy, 9)]);
  await page.waitForTimeout(520);
  await touch("touchMove", [point(documentDrag.dx, documentDrag.dy, 9)]);
  await touch("touchEnd", []);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-pane-id]").length === 2,
  );
  record("Document tabs reuse the source split workspace", { panes: 2 });

  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement === "docked",
  );
  const wideLayout = await page.evaluate(() => ({
    canvasHeight: document
      .querySelector('canvas[aria-label="Sprite canvas"]')
      ?.getBoundingClientRect().height,
    toolLayout: document.querySelector(".xse-tool-rail")?.dataset.layout,
    page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  }));
  assert.deepEqual(wideLayout.page, [844, 390]);
  assert.ok(wideLayout.canvasHeight >= 180 && wideLayout.toolLayout === "column");
  record("Wide aspect selects the shared side-by-side workspace", wideLayout);

  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement === "docked",
  );
  const desktop = await page.evaluate(() => {
    const tool = document
      .querySelector(
        '.xse-tool-rail button[aria-label="Pencil"],.xse-tool-rail button[aria-label="铅笔"]',
      )
      ?.getBoundingClientRect();
    return {
      tool: [tool?.width, tool?.height],
      topCount: document.querySelectorAll(".xse-touch-top-tools").length,
      railCount: document.querySelectorAll(".xse-touch-shortcut-rail").length,
      dockCount: document.querySelectorAll(".xse-workspace-panel-dock").length,
    };
  });
  assert.deepEqual(desktop.tool, [32, 34]);
  assert.equal(desktop.topCount + desktop.railCount + desktop.dockCount, 0);
  record("Desktop source controls remain", desktop);

  await fs.writeFile(
    config.root + "/.tmp/qa-touch-editor.json",
    JSON.stringify(
      {
        passed: true,
        method: "Ego Chromium touch emulation and CSS viewport measurement",
        results,
      },
      null,
      2,
    ),
  );
  console.log({ passed: true, checks: results.length });
} finally {
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  if (!resumed) await task.finish({ keep: [] });
}
