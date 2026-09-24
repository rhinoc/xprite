// Payload for ego-browser nodejs. Wrapper supplies captureConfig = {spaceId,pageLabel}.
// Uses public UI and DOM observations only; never accesses React/core internals.
const task = await taskSpace(captureConfig.spaceId);
if (task.ownership !== "agent") throw Error("Alignment QA requires the existing agent-owned space");
const page = task.page(captureConfig.pageLabel);
const fs = await import("node:fs/promises");
const crypto = await import("node:crypto");
const root = process.cwd();
const report = {
  startedAt: new Date().toISOString(),
  spaceId: task.spaceId,
  page: page.label,
  method:
    "Ego public controls and DOM geometry; discrete wheel uses explicitly synthetic line-mode DOM event (not physical-device parity)",
  checks: [],
  passed: false,
};
const assert = (value, message) => {
  if (!value) throw Error(message);
};
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
const observe = async (label) => {
  console.log(`ALIGNMENT_SNAPSHOT ${label}`);
  console.log(await page.snapshot());
};
const check = async (name, run) => {
  try {
    const details = await run();
    report.checks.push({ name, passed: true, details });
    console.log(`ALIGNMENT_CHECK ${name}: pass`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: String(error) });
    throw error;
  }
};
const currentFrame = () =>
  page.evaluate(() => Number(document.querySelector('input[aria-label="Current frame"]')?.value));
const zoom = () =>
  page.evaluate(() => Number(document.querySelector('input[aria-label="Zoom"]')?.value));
const geometry = () =>
  page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scene: rect("[data-ui-scene]"),
      canvas: rect('canvas[aria-label="Sprite canvas"]'),
      status: rect(".xse-status"),
      frames: rect(".xse-timeline-frame-pane"),
      timelineVisible: document
        .querySelector("[data-ui-scene]")
        ?.getAttribute("data-timeline-visible"),
    };
  });
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".xse-timeline-layer-row")].map((row) => {
      const name = row.querySelector(".xse-timeline-layer-name");
      const actions = [...row.querySelectorAll(".xse-timeline-layer-action")].map((n) =>
        n.getAttribute("aria-label"),
      );
      return {
        name: name?.getAttribute("aria-label"),
        selected: name?.getAttribute("aria-pressed") === "true",
        visible: actions[0]?.startsWith("Hide "),
        locked: actions[1]?.startsWith("Unlock "),
        actions,
      };
    }),
  );
const button = (label) => `button[aria-label=${JSON.stringify(label)}]`;
const canvasCenter = async () =>
  page.evaluate(() => {
    const r = document.querySelector('canvas[aria-label="Sprite canvas"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
let failure;
try {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1405,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.goto(captureConfig.url ?? "http://127.0.0.1:5173/editor", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  await observe("before importing real project");
  const fixture = `${root}/apps/editor/assets/examples/xprite/xprite.ase`;
  const fixtureBytes = await fs.readFile(fixture);
  report.fixture = {
    path: fixture,
    sha256: crypto.createHash("sha256").update(fixtureBytes).digest("hex"),
  };
  await fs.mkdir("/tmp/aseprite-alignment-qa", { recursive: true });
  const importPath = "/tmp/aseprite-alignment-qa/alignment-xprite.ase";
  await fs.writeFile(importPath, fixtureBytes);
  await page.setInputFiles('input[type="file"]', [importPath]);
  await page.waitForSelector('[role="tab"][aria-label="alignment-xprite.ase"]', {
    state: "visible",
  });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
      "1 layers, 10 frames",
  );
  await settle();
  await check("real Harvester import", async () => ({
    timeline: await page.evaluate(() =>
      document.querySelector('[aria-label="Timeline"]').getAttribute("aria-description"),
    ),
    frame: await currentFrame(),
  }));
  await observe("imported timeline and controls");
  await check("responsive four sizes without document overflow", async () => {
    const observations = [];
    for (const [width, height] of captureConfig.sizes ?? [
      [1405, 768],
      [1920, 1080],
      [1024, 768],
      [390, 844],
    ]) {
      await page.cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.waitForFunction(
        ({ width, height }) => innerWidth === width && innerHeight === height,
        { width, height },
      );
      await settle();
      const g = await geometry();
      observations.push(g);
      assert(
        g.scrollWidth <= width + 1,
        `Document horizontal overflow at ${width}: ${g.scrollWidth}`,
      );
      assert(
        g.scrollHeight <= height + 1,
        `Document vertical overflow at ${height}: ${g.scrollHeight}`,
      );
      for (const [key, r] of Object.entries({
        scene: g.scene,
        canvas: g.canvas,
        status: g.status,
        frames: g.frames,
      })) {
        assert(r && r.width > 0 && r.height > 0, `${key} has no usable bounds at ${width}`);
        assert(
          r.x >= -1 && r.y >= -1 && r.right <= width + 1 && r.bottom <= height + 1,
          `${key} leaves viewport at ${width}: ${JSON.stringify(r)}`,
        );
      }
    }
    return observations;
  });
  await check("short windows scroll without overlapping lower toolbar controls", async () => {
    await page.cdp("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 360,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await settle();
    const bounds = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      return {
        scene: rect("[data-ui-scene]"),
        text: rect('button[aria-label="Text"]'),
        preview: rect('button[aria-label="Show Preview"]'),
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    assert(
      bounds.scene.height >= 420 && bounds.scrollHeight >= 420,
      "Compact window must retain usable minimum height",
    );
    assert(bounds.preview.top >= bounds.text.bottom, "Lower toolbar controls overlap");
    return bounds;
  });
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1405,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await settle();
  await observe("canonical dock controls");
  await check("timeline hide extends canvas exactly one dock", async () => {
    const before = await geometry();
    await page.click(button("Hide Timeline"), { label: "hide timeline dock" });
    await page.waitForFunction(
      () =>
        document.querySelector("[data-ui-scene]")?.getAttribute("data-timeline-visible") ===
        "false",
    );
    await settle();
    const hidden = await geometry(),
      extension = hidden.canvas.height - before.canvas.height;
    assert(Math.abs(extension - 171) <= 2, `Expected one 171px extension, received ${extension}`);
    assert(Math.abs(hidden.canvas.y - before.canvas.y) <= 1, "Timeline toggle moved canvas top");
    await page.click(button("Show Timeline"), { label: "restore timeline dock" });
    await settle();
    const restored = await geometry();
    assert(
      Math.abs(restored.canvas.height - before.canvas.height) <= 1,
      "Timeline restoration changed original canvas height",
    );
    return { before, hidden, restored, extension };
  });
  await check("Fit Screen shortcut", async () => {
    await page.fill('input[aria-label="Zoom"]', "1600");
    await page.press('input[aria-label="Zoom"]', "Enter");
    const before = await zoom();
    await page.focus('canvas[aria-label="Sprite canvas"]');
    await page.keyboard.press("ControlOrMeta+0");
    await settle();
    const after = await zoom();
    assert(
      before === 1600 && after > 0 && after < before,
      `Fit Screen failed: ${before} -> ${after}`,
    );
    return { before, after };
  });
  await observe("before row flag gestures");
  await check("row visibility and lock preserve active layer", async () => {
    const initial = await rows(),
      active = initial.find((row) => row.selected),
      target = initial.find((row) => !row.selected);
    assert(active && target, "Need distinct active and target layer");
    for (const actionIndex of [0, 1]) {
      const before = (await rows()).find((row) => row.name === target.name);
      await page.click(button(before.actions[actionIndex]), {
        label: actionIndex ? "toggle inactive layer lock" : "toggle inactive layer visibility",
      });
      await settle();
      const changed = await rows();
      assert(
        changed.find((row) => row.selected)?.name === active.name,
        "Row flag changed active layer",
      );
      const after = changed.find((row) => row.name === target.name),
        field = actionIndex ? "locked" : "visible";
      assert(after[field] !== before[field], `${field} did not toggle`);
      await page.click(button(after.actions[actionIndex]), { label: "restore original row flag" });
      await settle();
    }
    return { initial, restored: await rows() };
  });
  await check("Alt-eye solo restores previous visibility", async () => {
    const initial = await rows(),
      target = initial.find((row) => !row.selected) ?? initial[0];
    await page.keyboard.down("Alt");
    try {
      await page.click(button(target.actions[0]), { label: "solo target layer" });
    } finally {
      await page.keyboard.up("Alt");
    }
    await settle();
    const solo = await rows();
    assert(
      solo.every((row) => row.visible === (row.name === target.name)),
      "Alt-eye did not isolate target",
    );
    assert(
      solo.find((row) => row.selected)?.name === initial.find((row) => row.selected)?.name,
      "Solo changed active layer",
    );
    const soloTarget = solo.find((row) => row.name === target.name);
    await page.keyboard.down("Alt");
    try {
      await page.click(button(soloTarget.actions[0]), { label: "restore solo visibility" });
    } finally {
      await page.keyboard.up("Alt");
    }
    await settle();
    const restored = await rows();
    assert(
      JSON.stringify(restored.map((row) => [row.name, row.visible])) ===
        JSON.stringify(initial.map((row) => [row.name, row.visible])),
      "Alt-eye restore differs from saved state",
    );
    return { initial, solo, restored };
  });
  await check("Alt-eye keeps an initially hidden target visible on restore", async () => {
    const target = (await rows()).find((row) => !row.selected);
    if (target.visible) await page.click(button(target.actions[0]));
    await settle();
    const hidden = (await rows()).find((row) => row.name === target.name);
    await page.keyboard.down("Alt");
    try {
      await page.click(button(hidden.actions[0]));
    } finally {
      await page.keyboard.up("Alt");
    }
    await settle();
    const solo = (await rows()).find((row) => row.name === target.name);
    await page.keyboard.down("Alt");
    try {
      await page.click(button(solo.actions[0]));
    } finally {
      await page.keyboard.up("Alt");
    }
    await settle();
    assert(
      (await rows()).find((row) => row.name === target.name).visible,
      "Aseprite solo restore must keep clicked layer visible",
    );
    return { target: target.name, restored: await rows() };
  });
  await observe("before properties double clicks");
  await check("layer double-click properties", async () => {
    const target = (await rows()).find((row) => row.selected);
    await page.dblclick(button(target.name), { label: "open layer properties" });
    await page.waitForSelector('[role="dialog"][aria-label="Layer Properties"]', {
      state: "visible",
    });
    await observe("Layer Properties open");
    const name = await page.evaluate(
      () =>
        document.querySelector(
          '[role="dialog"][aria-label="Layer Properties"] input[aria-label="Name"]',
        )?.value,
    );
    assert(target.name === `Select layer ${name}`, "Layer properties opened wrong target");
    await page.click(button("Close Layer Properties"), { label: "close layer properties" });
    return { name };
  });
  await check("frame double-click properties", async () => {
    const label = await page.evaluate(() =>
      document.querySelector(".xse-timeline-frame-header button")?.getAttribute("aria-label"),
    );
    assert(label, "Frame header missing");
    await page.dblclick(button(label), { label: "open frame properties" });
    await page.waitForSelector('[role="dialog"][aria-label="Frame Properties"]', {
      state: "visible",
    });
    await observe("Frame Properties open");
    const duration = await page.evaluate(
      () => document.querySelector('input[aria-label="Duration (milliseconds)"]')?.value,
    );
    assert(Number(duration) > 0, "Frame duration missing");
    await page.click('[role="dialog"][aria-label="Frame Properties"] button[aria-label="Cancel"]', {
      label: "close frame properties",
    });
    return { label, duration };
  });
  await observe("before canvas frame wheel");
  await check("discrete Ctrl Shift wheel event changes frame without zoom", async () => {
    await page.fill('input[aria-label="Current frame"]', "10");
    await page.press('input[aria-label="Current frame"]', "Enter");
    await page.focus('canvas[aria-label="Sprite canvas"]');
    const center = await canvasCenter();
    await page.mouse.move(center.x, center.y, { label: "target animation canvas" });
    const before = await currentFrame(),
      beforeZoom = await zoom();
    // CDP exposes only pixel wheel deltas, classified as precise trackpad input.
    // Inject a DOM line-mode wheel explicitly to exercise the discrete bridge;
    // this is a synthetic-event integration check, not hardware validation.
    await page.evaluate(
      ({ x, y }) =>
        document.querySelector('canvas[aria-label="Sprite canvas"]').dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            deltaMode: 1,
            deltaY: 1,
            ctrlKey: true,
            shiftKey: true,
          }),
        ),
      center,
    );
    await page.waitForFunction(
      (old) => Number(document.querySelector('input[aria-label="Current frame"]')?.value) !== old,
      before,
      { timeout: 5000 },
    );
    await settle();
    const after = await currentFrame(),
      afterZoom = await zoom();
    assert(after >= 1 && after <= 10 && after !== before, "Frame wheel did not step");
    assert(afterZoom === beforeZoom, "Frame wheel changed zoom");
    return { before, after, beforeZoom, afterZoom };
  });
  await observe("before standby status check");
  await check("status exposes current frame and duration", async () => {
    const center = await canvasCenter();
    await page.mouse.move(center.x + 2, center.y + 2, { label: "inspect animation status" });
    await settle();
    const frame = await currentFrame();
    await page.waitForFunction(
      (frame) =>
        [...document.querySelectorAll('[role="status"]')].some(
          (node) =>
            new RegExp(`Frame\\s+${frame}\\b`).test(node.textContent ?? "") &&
            /Duration/.test(node.textContent ?? ""),
        ),
      frame,
      { timeout: 5000 },
    );
    const text = await page.evaluate(() =>
      [...document.querySelectorAll('[role="status"]')]
        .map((node) => node.textContent.trim())
        .join(" | "),
    );
    assert(/Duration\s+\S+\s*\/\s*\S+/.test(text), `Duration lacks frame/total: ${text}`);
    return { frame, text };
  });
  await check("Invert Selection shortcut toggles full selection", async () => {
    await page.focus('canvas[aria-label="Sprite canvas"]');
    await page.keyboard.press("ControlOrMeta+Shift+i");
    await settle();
    const selected = await page.evaluate(
      () => document.querySelector('[role="status"]')?.textContent ?? "",
    );
    assert(
      /Selection size 105 86/.test(selected),
      "Invert empty selection must select full sprite",
    );
    await page.keyboard.press("ControlOrMeta+Shift+i");
    await settle();
    const cleared = await page.evaluate(
      () => document.querySelector('[role="status"]')?.textContent ?? "",
    );
    assert(!cleared.includes("Selection size"), "Second inversion must clear full selection");
    return { selected, cleared };
  });
  await observe("before canvas flip command");
  await check("Flip Canvas menu changes pixels and Undo restores them", async () => {
    await page.mouse.move(1300, 12, { label: "clear canvas pointer" });
    await settle();
    const raster = () =>
      page.evaluate(() => document.querySelector('canvas[aria-label="Sprite canvas"]').toDataURL());
    const before = await raster();
    await page.click(button("Sprite"));
    await observe("Sprite menu");
    await page.click('[role="menu"][aria-label="Sprite"] button[aria-label="Rotate Canvas"]');
    await observe("Rotate Canvas submenu");
    await page.click(
      '[role="menu"][aria-label="Rotate Canvas"] button[aria-label="Flip Canvas Horizontal"]',
    );
    await page.mouse.move(1300, 12, { label: "clear flip menu hover" });
    await settle();
    const flipped = await raster();
    assert(flipped !== before, "Canvas flip must visibly change sprite pixels");
    await page.focus('canvas[aria-label="Sprite canvas"]');
    await page.keyboard.press("ControlOrMeta+z");
    await page.mouse.move(1300, 12, { label: "clear canvas pointer" });
    await settle();
    // Canvas publication can trail React by another animation frame; wait for
    // the actual invariant rather than assuming two RAFs completed rendering.
    try {
      await page.waitForFunction(
        (expected) =>
          document.querySelector('canvas[aria-label="Sprite canvas"]').toDataURL() === expected,
        before,
        { timeout: 5000 },
      );
    } catch (error) {
      const actual = await raster();
      for (const [name, png] of Object.entries({ before, flipped, undo: actual }))
        await fs.writeFile(
          `${root}/.tmp/alignment-flip-${name}.png`,
          Buffer.from(png.split(",")[1], "base64"),
        );
      throw error;
    }
    const restored = await raster();
    assert(restored === before, "Undo must restore exact rendered canvas");
    return { changed: true, undoExact: true };
  });
  report.passed = true;
} catch (error) {
  failure = error;
  report.error = String(error);
  await observe("failure state");
} finally {
  report.completedAt = new Date().toISOString();
  await fs.mkdir(`${root}/.tmp`, { recursive: true });
  await fs.writeFile(`${root}/.tmp/alignment-browser-qa.json`, JSON.stringify(report, null, 2));
  console.log(`ALIGNMENT_BROWSER_REPORT:${JSON.stringify(report)}`);
}
if (failure) throw failure;
console.log(await page.snapshot());
