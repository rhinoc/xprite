// Run with ego-browser nodejs. Prefix globalThis.intrinsicLayoutQA = { root, space?, url? }.
// The browser CLI runs elsewhere; root is the absolute repository directory.
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const config = globalThis.intrinsicLayoutQA ?? {};
const root = config.root;
if (!root) throw new Error("Set intrinsicLayoutQA.root to the repository directory.");
const resumed = config.space;
const task = await taskSpace(resumed ? Number(resumed) : "Intrinsic UI regression");
const page = task.page("p1");
if (!resumed) await page.goto(config.url ?? "http://localhost:5173/editor");
await page.evaluate(() => {
  localStorage.removeItem("xse.layout.workspace-panel-selection.v3");
  localStorage.removeItem("xse.layout.workspace-panels.v5");
});
await page.reload();
const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      ),
  );
const measure = () =>
  page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector),
        r = node?.getBoundingClientRect();
      return r ? { width: r.width, height: r.height, x: r.x, y: r.y } : null;
    };
    const canvas = document.querySelector('canvas[aria-label="Sprite canvas"]');
    return {
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      scene: rect(".xse-editor-window"),
      canvas: rect('canvas[aria-label="Sprite canvas"]'),
      panelArrangement:
        document.querySelector(".xse-editor-window")?.dataset.workspacePanelArrangement,
      shortcutRail: rect(".xse-touch-shortcut-rail"),
      workspaceDock: rect(".xse-workspace-panel-dock"),
      panelTabs: rect(".xse-workspace-panel-tabs"),
      toolLayout: document.querySelector(".xse-tool-rail")?.dataset.layout,
      page: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      pencil: rect('button[aria-label="Pencil"],button[aria-label="铅笔"]'),
      brush: rect('input[aria-label="Brush size"],input[aria-label="笔刷大小"]'),
      tab: rect(".xse-document-tab"),
      frame: rect('input[aria-label="Current frame"],input[aria-label="当前帧"]'),
      timeline: rect(".xse-timeline"),
      palette: rect(".xse-palette"),
      source: canvas
        ? { width: Number(canvas.dataset.uiWidth), height: Number(canvas.dataset.uiHeight) }
        : null,
      transform: getComputedStyle(document.querySelector(".xse-editor-window")).transform,
    };
  });
const samples = [];
try {
  for (const size of [
    { width: 1280, height: 800, deviceScaleFactor: 1 },
    { width: 960, height: 525, deviceScaleFactor: 1 },
    { width: 390, height: 844, deviceScaleFactor: 1 },
    { width: 844, height: 390, deviceScaleFactor: 1 },
    { width: 1280, height: 800, deviceScaleFactor: 2 },
  ]) {
    await page.cdp("Emulation.setDeviceMetricsOverride", { ...size, mobile: false });
    await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
    await settle();
    const sample = await measure();
    assert.equal(sample.scene.width, sample.viewport[0]);
    assert.equal(sample.scene.height, sample.viewport[1]);
    assert.equal(sample.page.width, sample.viewport[0], "No horizontal page overflow.");
    assert.equal(sample.page.height, sample.viewport[1], "No vertical page overflow.");
    assert.equal(sample.transform, "none", "Runtime must not fit-scale the scene.");
    const compact = size.width / size.height < 1.2;
    assert.equal(
      sample.panelArrangement,
      compact ? "stacked" : "docked",
      "The selected layout config follows the viewport ratio.",
    );
    if (compact) {
      assert.equal(sample.toolLayout, "row", "The shared tool rail follows the compact layout.");
      assert.ok(sample.shortcutRail.width >= 40, "The shortcut rail remains tappable.");
      assert.ok(
        sample.workspaceDock.height >= 60 && sample.panelTabs.width > 0,
        "The shared workspace panels remain available.",
      );
      if (size.width === 390)
        assert.ok(
          sample.canvas.width >= 300,
          "The compact viewport reserves at least 300px for drawing.",
        );
      if (size.height === 390)
        assert.ok(sample.canvas.height >= 180, "The wide viewport keeps a useful canvas.");
    } else {
      assert.equal(sample.toolLayout, "column", "The shared tool rail follows the wide layout.");
      assert.equal(sample.pencil.width, 32, "Desktop tool width remains Xprite-sized.");
      assert.equal(sample.pencil.height, 34, "Desktop tool height remains Xprite-sized.");
      for (const name of ["pencil", "brush", "tab", "frame"]) {
        assert.ok(sample[name], `Missing ${name}`);
        if (samples.length && samples[samples.length - 1].panelArrangement === "docked") {
          const prior = samples[samples.length - 1];
          assert.equal(
            sample[name].width,
            prior[name].width,
            `${name} width changed with viewport/DPR`,
          );
          assert.equal(
            sample[name].height,
            prior[name].height,
            `${name} height changed with viewport/DPR`,
          );
        }
      }
    }
    assert.equal(
      sample.source.width,
      sample.canvas.width,
      "Canvas logical width follows its own dock.",
    );
    assert.equal(
      sample.source.height,
      sample.canvas.height,
      "Canvas logical height follows its own dock.",
    );
    samples.push(sample);
  }
  assert.notEqual(samples[0].canvas.width, samples[1].canvas.width);
  assert.notEqual(samples[0].canvas.height, samples[1].canvas.height);
  const before = await measure();
  await page.click('button[aria-label="Hide Timeline"],button[aria-label="隐藏时间轴"]');
  await page.waitForFunction(
    (oldHeight) =>
      document.querySelector('canvas[aria-label="Sprite canvas"]')?.getBoundingClientRect().height >
      oldHeight,
    before.canvas.height,
  );
  const hidden = await measure();
  assert.equal(hidden.timeline, null);
  assert.equal(hidden.canvas.height, before.canvas.height + before.timeline.height);
  await page.click('button[aria-label="Show Timeline"]');
  await settle();
  const restored = await measure();
  await page.focus(
    '[role="separator"][aria-label="Resize timeline"],[role="separator"][aria-label="调整时间轴大小"]',
  );
  await page.press(
    '[role="separator"][aria-label="Resize timeline"],[role="separator"][aria-label="调整时间轴大小"]',
    "ArrowUp",
  );
  await settle();
  const resized = await measure();
  assert.equal(resized.timeline.height, restored.timeline.height + 24);
  assert.equal(resized.canvas.height, restored.canvas.height - 24);
  assert.equal(resized.pencil.height, restored.pencil.height);
  await page.press(
    '[role="separator"][aria-label="Resize timeline"],[role="separator"][aria-label="调整时间轴大小"]',
    "ArrowDown",
  );
  await settle();
  assert.equal((await measure()).timeline.height, restored.timeline.height);
  const report = {
    passed: true,
    samples,
    timelineHidden: hidden,
    timelineResized: resized,
    scope:
      "Live browser desktop and constrained layout; raw CSS pixel dimensions, no screenshot normalization.",
  };
  await fs.mkdir(`${root}/.tmp`, { recursive: true });
  await fs.writeFile(`${root}/.tmp/intrinsic-layout-browser.json`, JSON.stringify(report, null, 2));
  console.log({
    passed: true,
    viewports: samples.map((s) => s.viewport),
    panelArrangement: samples.map((sample) => sample.panelArrangement),
    sharedControls: ["pencil", "brush", "tab", "frame"],
    timelineToggle: true,
    timelineResize: true,
  });
} finally {
  await page.cdp("Emulation.clearDeviceMetricsOverride");
  if (!resumed) await task.finish({ keep: [] });
}
