// Browser checks for the Aseprite-parity UX fixes (Enter/Esc in dialogs, flip without a
// selection, pixel-perfect default, dialog preloading, F8 preview, onion skin tooltip and the
// startup preload). Run against a dev server or a preview build:
//   node scripts/e2e/browser/verify-ux-audit-fixes.mjs [http://localhost:5173/]
import assert from "node:assert/strict";

import { chromium } from "playwright";
import { PNG } from "pngjs";

const URL = process.argv[2] ?? "http://localhost:5173/";
const VIEWPORT = { width: 1440, height: 900 };
const SPRITE = 32;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dialogs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute("aria-label")),
  );
async function waitDialog(page, name, open = true) {
  for (let i = 0; i < 100; i++) {
    if ((await dialogs(page)).includes(name) === open) return;
    await sleep(100);
  }
  assert.fail(`${name} did not ${open ? "open" : "close"}`);
}

async function openEditor(browser, warnings = []) {
  const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
  // Use the download fallback instead of a native save picker the test cannot answer.
  await context.addInitScript(() => {
    for (const name of ["showSaveFilePicker", "showOpenFilePicker", "showDirectoryPicker"])
      delete window[name];
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(2500);
  await page.keyboard.press("Control+n");
  await page.waitForSelector('input[data-label-source="Width"]');
  for (const field of ["Width", "Height"]) {
    await page.locator(`input[data-label-source="${field}"]`).fill(String(SPRITE));
  }
  await page.getByRole("button", { name: /^OK$/ }).first().click();
  await waitDialog(page, "New Sprite", false);
  await sleep(500);
  return { context, page };
}

/** The sprite's on-screen rectangle, found from its checkerboard. */
async function spriteGrid(page) {
  const box = await page.locator('canvas[aria-label="Sprite canvas"]').boundingBox();
  const image = PNG.sync.read(await page.screenshot());
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  for (let y = Math.ceil(box.y); y < box.y + box.height; y++)
    for (let x = Math.ceil(box.x); x < box.x + box.width; x++) {
      const i = (y * image.width + x) * 4;
      const [r, g, b] = image.data.subarray(i, i + 3);
      if (r === g && g === b && (r === 128 || r === 192)) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  const scale = (x1 - x0 + 1) / SPRITE;
  const center = (x, y) => [x0 + scale * (x + 0.5), y0 + scale * (y + 0.5)];
  const pixel = async (x, y) => {
    await page.mouse.move(5, VIEWPORT.height - 5);
    await sleep(100);
    const shot = PNG.sync.read(await page.screenshot());
    const [cx, cy] = center(x, y).map(Math.round);
    const i = (cy * shot.width + cx) * 4;
    return [...shot.data.subarray(i, i + 3)].join(",");
  };
  return { center, pixel };
}

const checks = {
  async enterConfirmsDialogs(browser) {
    const { context, page } = await openEditor(browser);
    // New Sprite: Enter from the Width field.
    await page.keyboard.press("Control+n");
    await waitDialog(page, "New Sprite");
    await page.locator('input[data-label-source="Width"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("48");
    await page.keyboard.press("Enter");
    await waitDialog(page, "New Sprite", false);
    // Go to Frame (combobox field).
    await page.keyboard.press("Alt+n");
    await page.keyboard.press("Alt+n");
    await page.keyboard.press("Alt+g");
    await waitDialog(page, "Go to Frame");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1");
    await page.keyboard.press("Enter");
    await waitDialog(page, "Go to Frame", false);
    assert.equal(await page.locator('input[aria-label="Current frame"]').inputValue(), "1");
    // Frame Properties: the typed duration is applied.
    await page.keyboard.press("p");
    await waitDialog(page, "Frame Properties");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("250");
    await page.keyboard.press("Enter");
    await waitDialog(page, "Frame Properties", false);
    await page.keyboard.press("p");
    await waitDialog(page, "Frame Properties");
    assert.equal(
      await page.locator('input[data-label-source="Duration (milliseconds)"]').inputValue(),
      "250",
    );
    await page.keyboard.press("Escape");
    await waitDialog(page, "Frame Properties", false);
    // Layer Properties.
    await page.keyboard.press("F2");
    await waitDialog(page, "Layer Properties");
    await page.keyboard.type("Ink");
    await page.keyboard.press("Enter");
    await waitDialog(page, "Layer Properties", false);
    // Export and Keyboard Shortcuts open with focus on the window body.
    await page.keyboard.press("Control+Alt+Shift+k");
    await waitDialog(page, "Keyboard Shortcuts");
    await page.waitForSelector('[role="dialog"][aria-label="Keyboard Shortcuts"] [role="listbox"]');
    await page.keyboard.press("Enter");
    await waitDialog(page, "Keyboard Shortcuts", false);
    const download = page.waitForEvent("download", { timeout: 15000 });
    await page.keyboard.press("Control+Alt+Shift+s");
    await waitDialog(page, "Export");
    await page.waitForSelector('[role="dialog"][aria-label="Export"] [data-ui-default-action]');
    await page.keyboard.press("Enter");
    // A multi-frame sprite exports as GIF and opens the GIF options dialog first; Enter confirms it too.
    await page.getByText("Export format").waitFor({ timeout: 10000 });
    await page.keyboard.press("Enter");
    await download;
    await waitDialog(page, "Export", false);
    await context.close();
  },

  async escapeClosesPropertyDialogs(browser) {
    const { context, page } = await openEditor(browser);
    await page.keyboard.press("F2");
    await waitDialog(page, "Layer Properties");
    await page.keyboard.type("Committed");
    await page.keyboard.press("Escape");
    await waitDialog(page, "Layer Properties", false);
    await page.keyboard.press("F2");
    await waitDialog(page, "Layer Properties");
    // cmd_layer_properties.cpp commits the name on Esc as well as on Enter.
    assert.equal(await page.locator('input[data-label-source="Name"]').inputValue(), "Committed");
    await page.keyboard.press("Escape");
    await waitDialog(page, "Layer Properties", false);
    await page.keyboard.press("p");
    await waitDialog(page, "Frame Properties");
    await page.keyboard.press("Escape");
    await waitDialog(page, "Frame Properties", false);
    await context.close();
  },

  async flipWithoutSelection(browser) {
    const { context, page } = await openEditor(browser);
    const grid = await spriteGrid(page);
    const empty = await grid.pixel(SPRITE - 3, 2);
    const source = await grid.pixel(2, 2);
    await page.keyboard.press("b");
    await page.mouse.click(...grid.center(2, 2));
    const painted = await grid.pixel(2, 2);
    assert.notEqual(painted, empty);
    await page.keyboard.press("Shift+h");
    await sleep(300);
    const flipped = await grid.pixel(SPRITE - 3, 2);
    assert.equal(flipped, painted, `painted=${painted} empty=${empty} flipped=${flipped}`);
    assert.equal(await grid.pixel(2, 2), source);
    await context.close();
  },

  async pixelPerfectDefaultsOff(browser) {
    const { context, page } = await openEditor(browser);
    await page.keyboard.press("b");
    const checkbox = page.getByRole("checkbox", { name: /pixel-perfect/i }).first();
    assert.equal(await checkbox.getAttribute("aria-checked"), "false");
    await context.close();
  },

  async exportOpensWithBody(browser) {
    const { context, page } = await openEditor(browser);
    await sleep(3000); // let the idle preload run
    await page.keyboard.press("Control+Alt+Shift+s");
    await page.waitForSelector('[role="dialog"][aria-label="Export"]');
    // The panel is part of the first frame the window paints.
    assert.ok(
      await page.evaluate(
        () =>
          !!document.querySelector('[role="dialog"][aria-label="Export"] [data-ui-default-action]'),
      ),
    );
    await context.close();
  },

  async fullscreenPreview(browser) {
    const { context, page } = await openEditor(browser);
    await page.keyboard.press("F8");
    await waitDialog(page, "Full Screen Preview");
    await page.keyboard.press("Escape");
    await waitDialog(page, "Full Screen Preview", false);
    await page.keyboard.press("F8");
    await waitDialog(page, "Full Screen Preview");
    await page.mouse.click(400, 400);
    await waitDialog(page, "Full Screen Preview", false);
    await context.close();
  },

  async escapeKeepsPreviewWindow(browser) {
    // PreviewEditorWindow is opened with openWindow(), not in the foreground, so its close
    // button does not process Esc (src/ui/window.h shouldProcessEscKeyToCloseWindow).
    const { context, page } = await openEditor(browser);
    await page.keyboard.press("F7");
    await waitDialog(page, "Preview");
    await page.keyboard.press("Escape");
    await sleep(300);
    assert.ok((await dialogs(page)).includes("Preview"));
    await context.close();
  },

  async onionSkinTooltip(browser) {
    const { context, page } = await openEditor(browser);
    await page.locator('button[aria-label="Onion skin"]').hover();
    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor({ timeout: 5000 });
    assert.match(await tooltip.innerText(), /F3/);
    await context.close();
  },

  async startupPreloadUsed(browser) {
    const warnings = [];
    const { context } = await openEditor(browser, warnings);
    await sleep(4000);
    assert.deepEqual(
      warnings.filter((text) => text.includes("preloaded")),
      [],
    );
    await context.close();
  },
};

const browser = await chromium.launch();
const only = process.argv[3];
let failed = 0;
for (const [name, check] of Object.entries(checks)) {
  if (only && name !== only) continue;
  try {
    await check(browser);
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${error.message.split("\n").slice(0, 3).join(" | ")}`);
  }
}
await browser.close();
process.exitCode = failed ? 1 : 0;
