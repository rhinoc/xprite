// Run with ego-browser nodejs. Set globalThis.mobileDragPreviewQA = { root, space?, url? }.
// Checks that touch hold never opens a context menu and the translucent drop mask matches the target.
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const config = globalThis.mobileDragPreviewQA ?? {};
if (!config.root) throw Error("Set mobileDragPreviewQA.root to the repository directory.");
await fs.mkdir(`${config.root}/.tmp`, { recursive: true });
const task = await taskSpace(
  config.space ? Number(config.space) : "Mobile drag preview regression",
);
const page = task.page("p1");
const results = [];
const point = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
const touch = (type, points) => page.cdp("Input.dispatchTouchEvent", { type, touchPoints: points });
const bounds = (selector) =>
  page.evaluate(
    (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON(),
    selector,
  );
const reset = async () => {
  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-workspace-panel-pane]").length === 2 &&
      !!document.querySelector('[data-workspace-pane-tabs="tools"]') &&
      !!document.querySelector("[data-workspace-canvas-dock]"),
  );
};
const canvasTarget = (edge) =>
  page.evaluate((edge) => {
    const r = document.querySelector("[data-workspace-canvas-dock]").getBoundingClientRect();
    return { x: edge === "left" ? r.left + 7 : r.left + r.width / 2, y: r.top + r.height / 2 };
  }, edge);
const startTab = async (tab, id) => {
  const r = await bounds(`[data-workspace-panel-pane] [data-ui-tab-value="${tab}"]`);
  const p = point(r.x + r.width / 3, r.y + r.height / 2, id);
  await touch("touchStart", [p]);
  await page.waitForTimeout(520);
  return p;
};
const sameRect = (preview, actual) => {
  for (const key of ["x", "y", "width", "height"])
    assert.ok(
      Math.abs(preview[key] - actual[key]) < 1,
      `${key}: preview ${preview[key]}, actual ${actual[key]}`,
    );
};

try {
  await page.goto(config.url ?? "http://127.0.0.1:5173/editor");
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await reset();

  const pressed = await startTab("picker", 1);
  const suppressed = await page.evaluate(({ x, y }) => {
    const tab = document.elementFromPoint(x, y).closest("[data-ui-tab-value]");
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: x,
      clientY: y,
    });
    tab.dispatchEvent(event);
    return {
      prevented: event.defaultPrevented,
      menus: document.querySelectorAll('[role="menu"]').length,
    };
  }, pressed);
  assert.deepEqual(suppressed, { prevented: true, menus: 0 });
  results.push({ name: "Touch long press suppresses the browser context menu", suppressed });

  const left = await canvasTarget("left");
  await touch("touchMove", [point(left.x, left.y, 1)]);
  const split = await page.evaluate(() => ({
    kind: document.querySelector(".xse-workspace-drop-mask")?.dataset.previewKind,
    menus: document.querySelectorAll('[role="menu"]').length,
    mask: document
      .querySelector('.xse-workspace-drop-mask[data-preview-panel="picker"]')
      ?.getBoundingClientRect()
      .toJSON(),
    panelCopies: document.querySelectorAll(".xse-mobile-preview-pane").length,
  }));
  assert.equal(split.kind, "split");
  assert.equal(split.menus, 0);
  assert.equal(split.panelCopies, 0);
  await touch("touchEnd", []);
  const side = await bounds('[data-workspace-pane-tabs="picker"]');
  sameRect(split.mask, side);
  assert.deepEqual(
    await page.evaluate(() => {
      const pane = document.querySelector('[data-workspace-pane-tabs="picker"]');
      return {
        chrome: pane.querySelectorAll(".xse-workspace-panel-tabs").length,
        offset:
          pane.querySelector(".xse-workspace-panel-content").getBoundingClientRect().top -
          pane.getBoundingClientRect().top,
      };
    }),
    { chrome: 0, offset: 0 },
  );
  results.push({ name: "Canvas split preview matches dropped panel bounds", rect: side });

  const singleEdge = await bounds(
    '[data-workspace-pane-tabs="picker"] .xse-workspace-pane-edge-handle',
  );
  const timeline = await bounds('[data-workspace-panel-pane] [data-ui-tab-value="timeline"]');
  await touch("touchStart", [
    point(singleEdge.x + singleEdge.width / 2, singleEdge.y + singleEdge.height / 2, 2),
  ]);
  await touch("touchMove", [point(timeline.x + 8, timeline.y + timeline.height / 2, 2)]);
  const merge = await page.evaluate(() => ({
    kind: document.querySelector(".xse-workspace-drop-mask")?.dataset.previewKind,
    mask: document.querySelector(".xse-workspace-drop-mask")?.getBoundingClientRect().toJSON(),
  }));
  assert.equal(merge.kind, "merge");
  sameRect(merge.mask, await bounds('[data-workspace-pane-tabs="palette,timeline,tileset"]'));
  await touch("touchEnd", []);
  const merged = await page.evaluate(() =>
    [...document.querySelectorAll("[data-workspace-panel-pane] [data-ui-tab-value]")].map(
      (tab) => tab.dataset.uiTabValue,
    ),
  );
  assert.deepEqual(merged, ["palette", "picker", "timeline", "tileset"]);
  results.push({
    name: "Merge mask covers the target pane without cloning its tabs",
    tabs: merged,
  });

  await reset();
  await startTab("picker", 3);
  const center = await canvasTarget("center");
  await touch("touchMove", [point(center.x, center.y, 3)]);
  const floating = await page.evaluate(() => ({
    kind: document.querySelector(".xse-workspace-drop-mask")?.dataset.previewKind,
    rect: document
      .querySelector('.xse-workspace-drop-mask[data-preview-panel="picker"]')
      ?.getBoundingClientRect()
      .toJSON(),
  }));
  assert.equal(floating.kind, "float");
  await touch("touchEnd", []);
  const floated = await bounds("[data-workspace-float-id]");
  sameRect(floating.rect, floated);
  results.push({ name: "Floating preview matches dropped window bounds", rect: floated });

  await reset();
  const grip = await bounds(".xse-workspace-pane-edge-handle");
  await touch("touchStart", [point(grip.x + grip.width / 2, grip.y + grip.height / 2, 4)]);
  const groupCenter = await canvasTarget("center");
  await touch("touchMove", [point(groupCenter.x, groupCenter.y, 4)]);
  const whole = await page.evaluate(() => ({
    kind: document.querySelector(".xse-workspace-drop-mask")?.dataset.previewKind,
    count: document.querySelectorAll(".xse-workspace-drop-mask").length,
    rect: document.querySelector(".xse-workspace-drop-mask")?.getBoundingClientRect().toJSON(),
  }));
  assert.equal(whole.kind, "float");
  assert.equal(whole.count, 1);
  await touch("touchEnd", []);
  const group = await bounds("[data-workspace-float-id]");
  sameRect(whole.rect, group);
  const groupTabs = await page.evaluate(() =>
    document.querySelector("[data-workspace-float-id]")?.dataset.mobilePaneTabs.split(","),
  );
  assert.deepEqual(groupTabs, ["palette", "timeline", "picker", "tileset"]);
  results.push({ name: "One floating mask previews the whole pane position", tabs: groupTabs });

  await reset();
  const wholeGrip = await bounds(".xse-workspace-pane-edge-handle");
  await touch("touchStart", [
    point(wholeGrip.x + wholeGrip.width / 2, wholeGrip.y + wholeGrip.height / 2, 10),
  ]);
  const wholeLeft = await canvasTarget("left");
  await touch("touchMove", [point(wholeLeft.x, wholeLeft.y, 10)]);
  const wholeSplit = await page.evaluate(() => ({
    kind: document.querySelector(".xse-workspace-drop-mask")?.dataset.previewKind,
    rect: document.querySelector(".xse-workspace-drop-mask")?.getBoundingClientRect().toJSON(),
  }));
  assert.equal(wholeSplit.kind, "split");
  await touch("touchEnd", []);
  const wholeDock = await bounds('[data-workspace-pane-tabs="palette,timeline,picker,tileset"]');
  sameRect(wholeSplit.rect, wholeDock);
  results.push({
    name: "A single mask matches the expanded canvas split after moving the whole pane",
    rect: wholeDock,
  });

  await reset();
  const cancelledTab = await bounds('[data-workspace-panel-pane] [data-ui-tab-value="palette"]');
  const cancelledPoint = point(
    cancelledTab.x + cancelledTab.width / 3,
    cancelledTab.y + cancelledTab.height / 2,
    7,
  );
  await touch("touchStart", [cancelledPoint]);
  await touch("touchCancel", []);
  const lateMenu = await page.evaluate(({ x, y }) => {
    const tab = document.elementFromPoint(x, y).closest("[data-ui-tab-value]");
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: x,
      clientY: y,
    });
    tab.dispatchEvent(event);
    return event.defaultPrevented;
  }, cancelledPoint);
  assert.equal(lateMenu, true);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[role="menu"]').length), 0);
  results.push({ name: "A delayed touch context menu is blocked after pointer cancellation" });

  const tab = await bounds('[data-workspace-panel-pane] [data-ui-tab-value="palette"]');
  const double = async (id) => {
    await touch("touchStart", [point(tab.x + tab.width / 2, tab.y + tab.height / 2, id)]);
    await touch("touchEnd", []);
  };
  await double(5);
  await double(6);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[role="menu"]').length), 1);
  results.push({ name: "Touch double tap still opens the existing panel menu" });
  await page.press('[role="menu"]', "Escape");

  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.evaluate(() => {
    localStorage.removeItem("xse.layout.workspace-panels.v5");
    localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  });
  await page.reload();
  await page.waitForSelector(
    '.xse-editor-window[data-workspace-panel-arrangement="docked"] [data-ui-tab-value]',
  );
  await page.evaluate(() => {
    const tab = document.querySelector("[data-ui-tab-value]");
    const r = tab.getBoundingClientRect();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: r.x + 8,
      clientY: r.y + 8,
    });
    tab.dispatchEvent(event);
  });
  await page.waitForSelector('[role="menu"]');
  const desktop = await page.evaluate(() => ({
    panelArrangement:
      document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement,
    menus: document.querySelectorAll('[role="menu"]').length,
  }));
  assert.deepEqual(desktop, { panelArrangement: "docked", menus: 1 });
  results.push({ name: "Desktop context menu remains available" });

  await fs.writeFile(
    config.root + "/.tmp/qa-mobile-drag-preview.json",
    JSON.stringify({ passed: true, results }, null, 2),
  );
  console.log({ passed: true, checks: results.length, results });
} finally {
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  if (!config.space) await task.finish({ keep: [] });
}
