// Run with ego-browser nodejs. Set globalThis.mobileDockQA = { root, space?, url? }.
// Covers whole-pane drag, canvas-edge docking, floating, corner snap and resize.
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const config = globalThis.mobileDockQA ?? {};
if (!config.root) throw Error("Set mobileDockQA.root to the repository directory.");
await fs.mkdir(`${config.root}/.tmp`, { recursive: true });
const resumed = !!config.space;
const task = await taskSpace(
  resumed ? Number(config.space) : "Mobile workspace docking regression",
);
const page = task.page("p1");
const results = [];
const record = (name, data) => {
  results.push({ name, data });
  console.log(name, data);
};
const touch = (type, points) => page.cdp("Input.dispatchTouchEvent", { type, touchPoints: points });
const point = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
const bounds = (selector) =>
  page.evaluate(
    (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON(),
    selector,
  );
const tabDrag = async (source, target, id) => {
  await touch("touchStart", [point(source.x + source.width / 3, source.y + source.height / 2, id)]);
  await page.waitForTimeout(520);
  await touch("touchMove", [point(target.x, target.y, id)]);
  await touch("touchEnd", []);
};
const gripDrag = async (source, target, id) => {
  await touch("touchStart", [point(source.x + source.width / 2, source.y + source.height / 2, id)]);
  await touch("touchMove", [point(target.x, target.y, id)]);
  await touch("touchEnd", []);
};
const canvasTarget = (edge) =>
  page.evaluate((edge) => {
    const r = document.querySelector("[data-workspace-canvas-dock]").getBoundingClientRect();
    return edge === "center"
      ? { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      : edge === "left"
        ? { x: r.left + 7, y: r.y + r.height / 2 }
        : edge === "right"
          ? { x: r.right - 7, y: r.y + r.height / 2 }
          : edge === "top"
            ? { x: r.x + r.width / 2, y: r.top + 7 }
            : { x: r.x + r.width / 2, y: r.bottom - 7 };
  }, edge);
const paneTabs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-workspace-panel-pane]")].map((pane) =>
      pane.dataset.mobilePaneTabs.split(","),
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
      document.querySelectorAll("[data-workspace-panel-pane]").length === 1 &&
      !!document.querySelector("[data-workspace-canvas-dock]"),
  );
  assert.deepEqual(await paneTabs(), [["palette", "timeline", "picker", "tileset"]]);

  const divider = await bounds('.xse-workspace-panel-splitter[data-axis="vertical"]');
  assert.equal(divider.height, 4, "The mobile splitter uses the desktop four-pixel layout track.");
  const workarea = await bounds("[data-workspace-panel-layout]");
  await touch("touchStart", [point(divider.x + divider.width / 2, divider.y - 6, 20)]);
  await touch("touchMove", [
    point(divider.x + divider.width / 2, workarea.y + workarea.height / 2, 20),
  ]);
  await touch("touchEnd", []);
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("xse.layout.workspace-panels.v5") ?? "null")?.stacked?.dock
        ?.ratio === 0.5,
  );
  record("The four-pixel split divider has a wider touch target and snaps to center", {
    ratio: 0.5,
  });
  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 1,
  );

  await tabDrag(
    await bounds('[data-workspace-panel-pane] [data-ui-tab-value="picker"]'),
    await canvasTarget("left"),
    1,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 2,
  );
  assert.deepEqual(await paneTabs(), [["picker"], ["palette", "timeline", "tileset"]]);
  assert.equal((await bounds('.xse-workspace-panel-splitter[data-axis="horizontal"]')).width, 4);
  const contentOnly = await page.evaluate(() => {
    const pane = document.querySelector('[data-workspace-pane-tabs="picker"]');
    return {
      chrome: pane.querySelectorAll(".xse-workspace-panel-tabs").length,
      paneTop: pane.getBoundingClientRect().top,
      contentTop: pane.querySelector(".xse-workspace-panel-content").getBoundingClientRect().top,
    };
  });
  assert.equal(contentOnly.chrome, 0, "A single-tab pane has no tab or title bar.");
  assert.equal(contentOnly.contentTop, contentOnly.paneTop, "Its content starts at the pane top.");
  assert.ok(
    (await bounds("[data-workspace-canvas-dock]")).width < 200,
    "The canvas shares width with a side-docked panel.",
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 2,
  );
  record("Panel content docks beside the canvas and persists", { panes: await paneTabs() });

  const singleEdge = await bounds(
    '[data-workspace-pane-tabs="picker"] .xse-workspace-pane-edge-handle',
  );
  for (const id of [31, 32]) {
    await touch("touchStart", [
      point(singleEdge.x + singleEdge.width / 2, singleEdge.y + singleEdge.height / 2, id),
    ]);
    await touch("touchEnd", []);
  }
  await page.waitForFunction(
    () => !!document.querySelector('[role="menu"][aria-label="面板布局"]'),
  );
  await page.press('[role="menu"]', "Escape");
  record("A content-only pane keeps its layout menu on the frame edge", { tabs: await paneTabs() });

  const timelineTab = await bounds('[data-workspace-panel-pane] [data-ui-tab-value="timeline"]');
  await gripDrag(
    await bounds('[data-workspace-pane-tabs="picker"] .xse-workspace-pane-edge-handle'),
    { x: timelineTab.x + 8, y: timelineTab.y + timelineTab.height / 2 },
    2,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 1,
  );
  assert.deepEqual(await paneTabs(), [["palette", "picker", "timeline", "tileset"]]);
  record("Dragging a side panel onto another tab merges without duplicating content", {
    panes: await paneTabs(),
  });

  await tabDrag(
    await bounds('[data-workspace-panel-pane] [data-ui-tab-value="picker"]'),
    await canvasTarget("center"),
    3,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-float-id]").length === 1,
  );
  assert.deepEqual(await paneTabs(), [["palette", "timeline", "tileset"]]);
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll("[data-workspace-float-id] .xse-workspace-panel-tabs").length,
    ),
    0,
  );
  assert.ok(
    !!(await bounds("[data-workspace-float-id] .xse-colorbar")),
    "The original color picker is live inside the floating pane.",
  );
  record("Dropping a tab in the canvas floats its live panel", {
    floats: 1,
    dock: await paneTabs(),
  });

  const floating = await bounds("[data-workspace-float-id]");
  const workspace = await bounds("[data-workspace-panel-layout]");
  const edge = await bounds("[data-workspace-float-id] .xse-workspace-pane-edge-handle");
  const start = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
  await touch("touchStart", [point(start.x, start.y, 4)]);
  await touch("touchMove", [
    point(start.x + workspace.x - floating.x + 5, start.y + workspace.y - floating.y + 5, 4),
  ]);
  await touch("touchEnd", []);
  const snapped = await bounds("[data-workspace-float-id]");
  assert.equal(snapped.x, workspace.x);
  assert.equal(snapped.y, workspace.y);
  assert.equal(
    await page.evaluate(() => document.querySelectorAll("[data-workspace-float-id]").length),
    1,
  );
  const beforeSize = await bounds("[data-workspace-float-id]");
  await page.focus(".xse-floating-workspace-resize");
  await page.press(".xse-floating-workspace-resize", "ArrowLeft");
  await page.press(".xse-floating-workspace-resize", "ArrowUp");
  const afterSize = await bounds("[data-workspace-float-id]");
  assert.deepEqual(
    [afterSize.width, afterSize.height],
    [beforeSize.width - 12, beforeSize.height - 12],
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-float-id]").length === 1,
  );
  assert.deepEqual(
    [
      Math.round((await bounds("[data-workspace-float-id]")).width),
      Math.round((await bounds("[data-workspace-float-id]")).height),
    ],
    [afterSize.width, afterSize.height],
  );
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 568,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-float-id]").length === 1,
  );
  const narrowFloat = await bounds("[data-workspace-float-id]"),
    portraitWorkspace = await bounds("[data-workspace-panel-layout]");
  assert.ok(
    narrowFloat.left >= portraitWorkspace.left && narrowFloat.right <= portraitWorkspace.right + 1,
  );
  assert.ok(
    narrowFloat.bottom <= portraitWorkspace.bottom + 1,
    "The floating resize handle remains on screen after narrowing.",
  );
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-float-id]").length === 1,
  );
  record("Floating frame-edge drag snaps to a corner; resize and position persist", {
    position: [snapped.x, snapped.y],
    size: [afterSize.width, afterSize.height],
  });

  await gripDrag(
    await bounds("[data-workspace-float-id] .xse-workspace-pane-edge-handle"),
    await canvasTarget("right"),
    5,
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-workspace-float-id]").length === 0 &&
      document.querySelectorAll("[data-workspace-panel-pane]").length === 2,
  );
  assert.ok((await paneTabs()).some((tabs) => tabs.length === 1 && tabs[0] === "picker"));
  record("A floating tab docks back into a canvas split", { panes: await paneTabs() });

  await tabDrag(
    await bounds('[data-workspace-panel-pane] [data-ui-tab-value="timeline"]'),
    await canvasTarget("center"),
    21,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-float-id]").length === 1,
  );
  const bottomPane = await page.evaluate(() =>
    [...document.querySelectorAll("[data-workspace-panel-pane]")]
      .find((pane) => pane.querySelector('[data-ui-tab-value="palette"]'))
      ?.getBoundingClientRect()
      .toJSON(),
  );
  const floatEdge = await bounds("[data-workspace-float-id] .xse-workspace-pane-edge-handle");
  await touch("touchStart", [
    point(floatEdge.x + floatEdge.width / 2, floatEdge.y + floatEdge.height / 2, 22),
  ]);
  await touch("touchMove", [point(bottomPane.right - 7, bottomPane.y + bottomPane.height / 2, 22)]);
  await touch("touchEnd", []);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-workspace-float-id]").length === 0 &&
      document.querySelectorAll("[data-workspace-panel-pane]").length === 3,
  );
  record("A floating panel frame edge can split an existing docked panel", {
    panes: await paneTabs(),
  });

  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".xse-workspace-pane-edge-handle").length === 1,
  );
  await gripDrag(await bounds(".xse-workspace-pane-edge-handle"), await canvasTarget("center"), 6);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-workspace-panel-pane]").length === 0 &&
      document.querySelectorAll("[data-workspace-float-id]").length === 1,
  );
  const group = await page.evaluate(() =>
    [...document.querySelectorAll("[data-workspace-float-id] [data-ui-tab-value]")].map(
      (el) => el.dataset.uiTabValue,
    ),
  );
  assert.deepEqual(group, ["palette", "timeline", "picker", "tileset"]);
  const floatingGrip = await bounds("[data-workspace-float-id] .xse-workspace-pane-edge-handle");
  const floatingPanel = await bounds("[data-workspace-float-id]");
  const rightEdge = await canvasTarget("right");
  await touch("touchStart", [
    point(floatingGrip.x + floatingGrip.width / 2, floatingGrip.y + floatingGrip.height / 2, 7),
  ]);
  await touch("touchMove", [point(rightEdge.x, floatingPanel.y + 18, 7)]);
  await touch("touchEnd", []);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-workspace-float-id]").length === 0 &&
      document.querySelectorAll("[data-workspace-panel-pane]").length === 1,
  );
  assert.deepEqual(await paneTabs(), [["palette", "timeline", "picker", "tileset"]]);
  assert.equal(
    await page.evaluate(() => document.querySelector(".xse-workspace-panel-split")?.dataset.axis),
    "horizontal",
  );
  record("The pane title grip floats all tabs; the floating title redocks the whole group", {
    group,
  });

  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-workspace-panel-pane]").length === 1,
  );
  await tabDrag(
    await bounds('[data-workspace-panel-pane] [data-ui-tab-value="palette"]'),
    await canvasTarget("left"),
    70,
  );
  await page.waitForFunction(
    () => !!document.querySelector('[data-workspace-pane-tabs="palette"]'),
  );
  const palettePane = await bounds('[data-workspace-pane-tabs="palette"]');
  const blank = {
    x: palettePane.x + palettePane.width / 2,
    y: palettePane.y + palettePane.height * 0.8,
  };
  const swatch = await bounds('[data-workspace-pane-tabs="palette"] [data-palette-index="8"]');
  await touch("touchStart", [point(swatch.x + swatch.width / 2, swatch.y + swatch.height / 2, 75)]);
  await touch("touchEnd", []);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-workspace-pane-tabs="palette"]')?.dataset.paneSelected,
    ),
    null,
    "An interactive color swatch does not trigger pane selection.",
  );
  await touch("touchStart", [point(blank.x, blank.y, 71)]);
  await touch("touchEnd", []);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-workspace-pane-tabs="palette"]')?.dataset.paneSelected,
    ),
    "true",
  );
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-workspace-pane-tabs="palette"]'), "::after")
          .borderTopStyle,
    ),
    "dashed",
  );
  await touch("touchStart", [point(blank.x, blank.y, 76)]);
  await page.waitForTimeout(520);
  await touch("touchCancel", []);
  const blankContextPrevented = await page.evaluate(({ x, y }) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: x,
      clientY: y,
    });
    document.elementFromPoint(x, y).dispatchEvent(event);
    return event.defaultPrevented;
  }, blank);
  assert.equal(
    blankContextPrevented,
    true,
    "A delayed browser menu does not replace the blank-area drag.",
  );
  await touch("touchStart", [point(blank.x, blank.y, 72)]);
  await touch("touchMove", [point(blank.x + 25, blank.y + 12, 72)]);
  await touch("touchEnd", []);
  assert.ok(
    !!(await bounds('[data-workspace-pane-tabs="palette"]')),
    "A quick blank-area swipe does not move the pane.",
  );
  await touch("touchStart", [point(blank.x, blank.y, 73)]);
  await page.waitForTimeout(520);
  const blankCenter = await canvasTarget("center");
  await touch("touchMove", [point(blankCenter.x, blankCenter.y, 73)]);
  assert.equal(
    await page.evaluate(
      () => document.querySelector(".xse-workspace-drop-mask")?.dataset.previewKind,
    ),
    "float",
  );
  assert.equal(await page.evaluate(() => document.querySelectorAll('[role="menu"]').length), 0);
  await touch("touchEnd", []);
  await page.waitForFunction(
    () => !!document.querySelector('[data-workspace-float-id][data-workspace-pane-tabs="palette"]'),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-workspace-float-id][data-workspace-pane-tabs="palette"]')
          ?.dataset.paneSelected,
    ),
    "true",
  );
  const floatBefore = await bounds('[data-workspace-float-id][data-workspace-pane-tabs="palette"]');
  const floatBlank = {
    x: floatBefore.x + floatBefore.width / 2,
    y: floatBefore.y + floatBefore.height * 0.8,
  };
  await touch("touchStart", [point(floatBlank.x, floatBlank.y, 74)]);
  await page.waitForTimeout(520);
  await touch("touchMove", [point(floatBlank.x + 10, floatBlank.y - 80, 74)]);
  await touch("touchEnd", []);
  const floatAfter = await bounds('[data-workspace-float-id][data-workspace-pane-tabs="palette"]');
  assert.ok(
    floatAfter.x < floatBefore.x || floatAfter.y < floatBefore.y,
    "A blank-area long press moves a floating pane.",
  );
  record(
    "A faint selected outline and blank-area long press move docked and floating single-tab panes",
    { floatBefore, floatAfter },
  );

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
    canvas: document.querySelector('canvas[aria-label="Sprite canvas"]')?.getBoundingClientRect()
      .height,
    page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  }));
  assert.ok(wideLayout.canvas >= 180);
  assert.deepEqual(wideLayout.page, [844, 390]);
  record("Short wide layout retains the canvas and docking model", wideLayout);

  await fs.writeFile(
    config.root + "/.tmp/qa-mobile-workspace-docking.json",
    JSON.stringify({ passed: true, results }, null, 2),
  );
  console.log({ passed: true, checks: results.length });
} finally {
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  if (!resumed) await task.finish({ keep: [] });
}
