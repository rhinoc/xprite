import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));
const GEOMETRY_MODULE = `/@fs${resolve(REPOSITORY, "packages/ui/src/utils.ts")}`;
const VIEWPORT = { width: 1080, height: 720 };
const FRAME_INTERVAL_MS = 100;
const DRAG_STEPS = 16;
const DRAG_STEP_MS = 60;
const LEAD_HOLD_MS = 900;
const RESULT_HOLD_MS = 1000;
const FINAL_HOLD_MS = 1200;
const DROP_INSET = 20;
const RESIZE_DISTANCE = 100;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function geometry(page, selector) {
  return page.evaluate(
    async ({ module, selector }) => {
      const { clientRect } = await import(module);
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing recording target: ${selector}`);
      const rect = clientRect(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
    { module: GEOMETRY_MODULE, selector },
  );
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y, { label: "grab workspace panel control" });
  await page.mouse.down();
  try {
    for (let index = 1; index <= DRAG_STEPS; index++) {
      const progress = index / DRAG_STEPS;
      await page.mouse.move(
        from.x + (to.x - from.x) * progress,
        from.y + (to.y - from.y) * progress,
      );
      await pause(DRAG_STEP_MS);
    }
  } finally {
    await page.mouse.up();
  }
}

/** Record compositor frames while operating the real timeline handle and splitter. */
export async function recordWorkspaceLayout(page, { directory, language }) {
  await mkdir(directory, { recursive: true });
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    ...VIEWPORT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const initial = await geometry(page, '[data-workspace-pane-tabs="timeline"]');
  if (initial.width <= initial.height)
    throw new Error("Start with the timeline docked at the bottom.");
  const actualLanguage = await page.evaluate(() => document.documentElement.lang);
  if (actualLanguage !== language) throw new Error(`Expected ${language}; got ${actualLanguage}.`);
  const frames = [];
  const actions = [];
  const started = performance.now();
  let stopped = false;
  const record = async () => {
    while (!stopped) {
      const timestamp = performance.now();
      const receipt = await page.cdp("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, ...VIEWPORT, scale: 1 },
      });
      const filename = `frame-${String(frames.length).padStart(4, "0")}.png`;
      await writeFile(resolve(directory, filename), Buffer.from(receipt.data, "base64"));
      frames.push({ filename, milliseconds: timestamp - started });
      await pause(Math.max(0, FRAME_INTERVAL_MS - (performance.now() - timestamp)));
    }
  };
  const recording = record();
  const mark = (action) => actions.push({ action, milliseconds: performance.now() - started });
  try {
    await pause(LEAD_HOLD_MS);
    const handle = await geometry(page, '[data-workspace-pane-tabs="timeline"] > button');
    const canvas = await geometry(page, "[data-workspace-canvas-dock]");
    mark("Dock timeline on the right");
    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: canvas.x + canvas.width - DROP_INSET, y: canvas.y + canvas.height / 2 },
    );
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-workspace-pane-tabs="timeline"]');
      return panel && panel.parentElement.dataset.axis === "horizontal";
    });
    await pause(RESULT_HOLD_MS);
    const splitter = await geometry(page, '[data-workspace-canvas-dock] + [role="separator"]');
    const center = { x: splitter.x + splitter.width / 2, y: splitter.y + splitter.height / 2 };
    mark("Resize the right timeline pane");
    await drag(page, center, { x: center.x - RESIZE_DISTANCE, y: center.y });
    await pause(RESULT_HOLD_MS);
    const movedHandle = await geometry(page, '[data-workspace-pane-tabs="timeline"] > button');
    const resizedCanvas = await geometry(page, "[data-workspace-canvas-dock]");
    mark("Return timeline to the bottom");
    await drag(
      page,
      { x: movedHandle.x + movedHandle.width / 2, y: movedHandle.y + movedHandle.height / 2 },
      {
        x: resizedCanvas.x + resizedCanvas.width / 2,
        y: resizedCanvas.y + resizedCanvas.height - DROP_INSET,
      },
    );
    await pause(FINAL_HOLD_MS);
  } finally {
    stopped = true;
    await recording;
  }
  const recordPath = resolve(directory, "recording.json");
  await writeFile(
    recordPath,
    `${JSON.stringify(
      {
        source: "Xprite editor / real pointer drag and resize",
        viewport: { ...VIEWPORT, dpr: 1 },
        language,
        actions,
        frames,
        durationMilliseconds: performance.now() - started,
      },
      null,
      2,
    )}\n`,
  );
  const concat =
    frames
      .map((frame, index) => {
        const duration =
          ((frames[index + 1]?.milliseconds ?? performance.now() - started) - frame.milliseconds) /
          1000;
        return `file '${resolve(directory, frame.filename)}'\nduration ${duration.toFixed(4)}\n`;
      })
      .join("") + `file '${resolve(directory, frames[frames.length - 1].filename)}'\n`;
  await writeFile(resolve(directory, "frames.ffconcat"), concat);
  return {
    recordPath,
    frameCount: frames.length,
    durationMilliseconds: performance.now() - started,
  };
}
