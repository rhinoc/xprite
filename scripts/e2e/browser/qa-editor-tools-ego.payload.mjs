// Durable Ego-browser payload. The wrapper injects qaConfig and runs this
// source with `ego-browser nodejs`; this file never creates or claims a space.
const config = qaConfig ?? {};
const spaceId = Number(config.spaceId);
const pageLabel = config.page || "p1";
const fixturePath = config.fixturePath;
const fixtureRelativePath = config.fixtureRelativePath || ".tmp/qa-fixtures/pixel.png";
const fixtureHash = config.fixtureHash;
const sourceHashes = config.sourceHashes || {};
if (!Number.isInteger(spaceId) || spaceId <= 0)
  throw new Error("Supply an existing positive Ego task-space id.");
if (!fixturePath || !fixtureHash)
  throw new Error("The QA wrapper must supply a private fixture path and hash.");
if (!Object.keys(sourceHashes).length)
  throw new Error("The QA wrapper must supply current source hashes.");

// Refuse to create, claim, or take over a task space. A numeric id must already
// be listed and agent-owned before taskSpace() is called.
const availableSpaces = await listTaskSpaces();
const listed = availableSpaces.find((space) => Number(space.spaceId ?? space.id) === spaceId);
if (!listed)
  throw new Error(`Ego task space ${spaceId} is not listed; refusing to create or claim it.`);
if (listed.ownership && listed.ownership !== "agent") {
  throw new Error(
    `Ego task space ${spaceId} is ${listed.ownership}-owned; refusing to take control.`,
  );
}
const task = await taskSpace(spaceId);
if (task.spaceId !== spaceId)
  throw new Error(`Ego resumed task space ${task.spaceId}, expected ${spaceId}.`);
if (task.ownership && task.ownership !== "agent") {
  throw new Error(
    `Ego task space ${spaceId} is ${task.ownership}-owned; stopping without browser actions.`,
  );
}
const existingPages = await task.pages();
if (!existingPages.some((candidate) => candidate.label === pageLabel)) {
  throw new Error(
    `Ego page ${pageLabel} is not an existing managed page in task space ${spaceId}.`,
  );
}
const page = task.page(pageLabel);
if (!page || page.spaceId !== spaceId)
  throw new Error(`Ego page ${pageLabel} is not in task space ${spaceId}.`);

console.log(`QA_PHASE:space-ready:${spaceId}:${pageLabel}`);

const canvasSelector = 'canvas[aria-label="Sprite canvas"]';
const zoomSelector = 'input[aria-label="Zoom"]';
const pixelPerfectSelector = '[role="checkbox"][aria-label="Pixel-perfect"]';
const fixtureBounds = { left: 555, top: 133, right: 932, bottom: 510 };
const points = [
  { x: 660, y: 180 },
  { x: 700, y: 210 },
];
const toolCases = [
  { key: "b", name: "pencil", drag: true },
  { key: "e", name: "eraser", drag: true },
  { key: "l", name: "line", drag: true },
  { key: "g", name: "bucket", drag: false },
  { key: "d", name: "contour", drag: true },
  { key: "r", name: "blur", drag: true },
  { key: "v", name: "move", drag: true },
  { key: "u", name: "rectangle", drag: true },
];
const pixelPerfectPoints = [
  { x: 620, y: 160 },
  { x: 660, y: 160 },
  { x: 700, y: 190 },
  { x: 740, y: 190 },
];

async function waitTwoFrames() {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function clearPointerAndWait() {
  await page.mouse.move(600, 12, { label: "clear canvas hover" });
  await waitTwoFrames();
}

async function visibleCanvasDigest() {
  return await page.evaluate(async (selector) => {
    const canvas = document.querySelector(selector);
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error("Visible Sprite canvas is unavailable.");
    if (!canvas.width || !canvas.height)
      throw new Error("Visible Sprite canvas has no backing pixels.");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Visible Sprite canvas has no readable 2D context.");
    const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!globalThis.crypto?.subtle) throw new Error("Browser Web Crypto SHA-256 is unavailable.");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return { width: canvas.width, height: canvas.height, sha256: hash };
  }, canvasSelector);
}

async function pressHistory(chord) {
  await page.focus(canvasSelector);
  await page.keyboard.press(chord);
  await clearPointerAndWait();
}

async function replayTool(testCase) {
  await page.focus(canvasSelector);
  await page.keyboard.press(testCase.key);
  await page.mouse.move(points[0].x, points[0].y, { label: `${testCase.name} start` });
  if (testCase.drag) {
    await page.mouse.down({ button: "left" });
    await page.mouse.move(points[1].x, points[1].y, { label: `${testCase.name} stroke` });
    await page.mouse.up({ button: "left" });
  } else {
    await page.mouse.click(points[0].x, points[0].y, { label: `${testCase.name} fill` });
  }
  await clearPointerAndWait();
}

console.log("QA_PHASE:page-goto");
await page.goto(config.url || "http://127.0.0.1:5173/editor", {
  waitUntil: "networkidle",
  timeout: 30_000,
});
// Keep viewport and DPR setup in this same Ego round as the page setup and all
// subsequent canvas reads; no screenshot or browser-resize heuristic is used.
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1405,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.waitForFunction(
  () =>
    innerWidth === 1405 &&
    innerHeight === 768 &&
    document.fonts.status === "loaded" &&
    [...document.images].every((image) => image.complete) &&
    !!document.querySelector('input[type="file"]'),
  undefined,
  { timeout: 30_000 },
);

console.log("QA_PHASE:fixture-import");
await page.setInputFiles('input[type="file"]', [fixturePath]);
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[role="status"]')].some((node) =>
      node.textContent?.includes("pixel.png"),
    ),
  undefined,
  { timeout: 30_000 },
);
const importedStatus = await page.evaluate(() =>
  [...document.querySelectorAll('[role="status"]')]
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean)
    .join(" | "),
);
await page.fill(zoomSelector, "800");
await page.press(zoomSelector, "Enter");
await page.waitForFunction(
  (selector) => document.querySelector(selector)?.value?.includes("800") === true,
  zoomSelector,
  { timeout: 10_000 },
);
await page.focus(canvasSelector);
await clearPointerAndWait();
const canvasBeforeTools = await visibleCanvasDigest();
console.log("QA_PHASE:fixture-ready:zoom-800");

const results = [];
for (const testCase of toolCases) {
  console.log(`QA_PHASE:tool-start:${testCase.name}`);
  // Every case starts from the exact imported fixture, then returns to that
  // state after redo so later cases do not depend on prior tool mutations.
  const before = await visibleCanvasDigest();
  await replayTool(testCase);
  const after = await visibleCanvasDigest();
  if (after.sha256 === before.sha256)
    throw new Error(`${testCase.name} did not change the visible canvas.`);
  await pressHistory("ControlOrMeta+z");
  const undo = await visibleCanvasDigest();
  if (undo.sha256 !== before.sha256)
    throw new Error(`${testCase.name} undo did not restore the visible canvas.`);
  await pressHistory("ControlOrMeta+Shift+z");
  const redo = await visibleCanvasDigest();
  if (redo.sha256 !== after.sha256)
    throw new Error(`${testCase.name} redo did not reproduce the visible canvas.`);
  results.push({
    key: testCase.key,
    name: testCase.name,
    points,
    before: before.sha256,
    after: after.sha256,
    undo: undo.sha256,
    redo: redo.sha256,
    changed: true,
    undoExact: true,
    redoExact: true,
  });
  await pressHistory("ControlOrMeta+z");
  const reset = await visibleCanvasDigest();
  if (reset.sha256 !== before.sha256)
    throw new Error(`${testCase.name} reset undo did not restore the fixture.`);
  console.log(`QA_PHASE:tool-pass:${testCase.name}`);
}

console.log("QA_PHASE:pixel-perfect-enable");
await page.focus(canvasSelector);
await page.keyboard.press("b");
await page.waitForSelector(pixelPerfectSelector, { state: "visible" });
const pixelPerfectInitial = await page.evaluate((selector) => {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLButtonElement))
    throw new Error("Pixel-perfect checkbox is unavailable.");
  return { checked: node.getAttribute("aria-checked") === "true", disabled: node.disabled };
}, pixelPerfectSelector);
if (pixelPerfectInitial.disabled)
  throw new Error("Pixel-perfect checkbox is disabled for the initial pencil settings.");
if (pixelPerfectInitial.checked)
  throw new Error("Pixel-perfect checkbox unexpectedly started checked.");
await page.click(pixelPerfectSelector, { label: "enable pixel-perfect" });
await page.waitForFunction(
  (selector) => document.querySelector(selector)?.getAttribute("aria-checked") === "true",
  pixelPerfectSelector,
  { timeout: 10_000 },
);
const pixelPerfectEnabled = await page.evaluate((selector) => {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLButtonElement))
    throw new Error("Pixel-perfect checkbox disappeared after activation.");
  return { checked: node.getAttribute("aria-checked") === "true", disabled: node.disabled };
}, pixelPerfectSelector);
if (!pixelPerfectEnabled.checked || pixelPerfectEnabled.disabled)
  throw new Error("Pixel-perfect checkbox did not become enabled and checked.");

console.log("QA_PHASE:tool-start:pencil-pixel-perfect");
const pixelPerfectBefore = await visibleCanvasDigest();
await page.focus(canvasSelector);
await page.keyboard.press("b");
await page.mouse.move(pixelPerfectPoints[0].x, pixelPerfectPoints[0].y, {
  label: "pixel-perfect start",
});
await page.mouse.down({ button: "left" });
for (const point of pixelPerfectPoints.slice(1)) {
  await page.mouse.move(point.x, point.y, { label: "pixel-perfect stroke" });
}
await page.mouse.up({ button: "left" });
await clearPointerAndWait();
const pixelPerfectAfter = await visibleCanvasDigest();
if (pixelPerfectAfter.sha256 === pixelPerfectBefore.sha256)
  throw new Error("Pixel-perfect pencil did not change the visible canvas.");
await pressHistory("ControlOrMeta+z");
const pixelPerfectUndo = await visibleCanvasDigest();
if (pixelPerfectUndo.sha256 !== pixelPerfectBefore.sha256)
  throw new Error("Pixel-perfect undo did not restore the visible canvas.");
await pressHistory("ControlOrMeta+Shift+z");
const pixelPerfectRedo = await visibleCanvasDigest();
if (pixelPerfectRedo.sha256 !== pixelPerfectAfter.sha256)
  throw new Error("Pixel-perfect redo did not reproduce the visible canvas.");
results.push({
  key: "b",
  name: "pencil-pixel-perfect",
  mode: "pixel-perfect",
  points: pixelPerfectPoints,
  before: pixelPerfectBefore.sha256,
  after: pixelPerfectAfter.sha256,
  undo: pixelPerfectUndo.sha256,
  redo: pixelPerfectRedo.sha256,
  changed: true,
  undoExact: true,
  redoExact: true,
});
await pressHistory("ControlOrMeta+z");
const pixelPerfectReset = await visibleCanvasDigest();
if (pixelPerfectReset.sha256 !== pixelPerfectBefore.sha256)
  throw new Error("Pixel-perfect reset undo did not restore the fixture.");
console.log("QA_PHASE:tool-pass:pencil-pixel-perfect");

const report = {
  method:
    "Ego browser user-input QA; visible Sprite canvas getImageData SHA-256, no screenshot/capture and no Aseprite-reference comparison",
  capturedAt: new Date().toISOString(),
  taskSpaceId: task.spaceId,
  page: page.label,
  url: await page.url(),
  viewport: { width: 1405, height: 768, deviceScaleFactor: 1 },
  fixture: {
    path: fixtureRelativePath,
    sha256: fixtureHash,
    dimensions: { width: 32, height: 32 },
    visibleBounds: fixtureBounds,
  },
  importedStatus,
  canvasBeforeTools,
  zoom: 800,
  points,
  pixelPerfect: {
    selector: pixelPerfectSelector,
    initial: pixelPerfectInitial,
    enabled: pixelPerfectEnabled,
    points: pixelPerfectPoints,
  },
  sourceHashes,
  results,
};
console.log(`QA_REPORT:${JSON.stringify(report)}`);
