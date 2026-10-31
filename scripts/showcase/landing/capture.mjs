#!/usr/bin/env node
// Capture the editor in a color family theme for the About page hero. Run against a dev
// or preview editor server: `node scripts/showcase/landing/capture.mjs http://localhost:5173/`.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));
const OUTPUT = resolve(REPOSITORY, "apps/growth/public/showcase/landing");
const THEME = "color-family-moss";
/** Desktop and phone editors; the phone uses touch so the editor picks its compact layout. */
const DEVICES = [
  { name: "editor", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, touch: false },
  { name: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, touch: true },
];
const EXAMPLE_NAME = "example.aseprite";
const SETTLE_MS = 1500;
const LANGUAGES = ["en", "zh-CN"];
const APPEARANCES = ["light", "dark"];

const editorUrl = process.argv[2] ?? "http://localhost:5173/";
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
await mkdir(OUTPUT, { recursive: true });
const records = [];
try {
  for (const device of DEVICES)
    for (const language of LANGUAGES)
      for (const appearance of APPEARANCES) {
        const context = await browser.newContext({
          viewport: device.viewport,
          deviceScaleFactor: device.deviceScaleFactor,
          hasTouch: device.touch,
          isMobile: device.touch,
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ({ theme, appearance: mode, language: locale }) => {
            localStorage.setItem("xse.ui.theme.v1", theme);
            localStorage.setItem("xse.ui.appearance-mode.v1", mode);
            localStorage.setItem("xse.ui.language.v1", locale);
          },
          { theme: THEME, appearance, language },
        );
        const page = await context.newPage();
        await page.goto(editorUrl);
        const example = page.getByText(EXAMPLE_NAME, { exact: true }).first();
        await example.waitFor({ timeout: 60_000 });
        if (device.touch) await example.tap();
        else await example.dblclick();
        await page.waitForSelector("canvas[data-editor-canvas]", { timeout: 30_000 });
        await page.waitForTimeout(SETTLE_MS);
        const png = await page.screenshot();
        const name = `${device.name}-${language}-${appearance}.png`;
        await writeFile(resolve(OUTPUT, name), png);
        records.push({
          file: name,
          theme: THEME,
          appearance,
          language,
          viewport: device.viewport,
          deviceScaleFactor: device.deviceScaleFactor,
          width: device.viewport.width * device.deviceScaleFactor,
          height: device.viewport.height * device.deviceScaleFactor,
          sha256: createHash("sha256").update(png).digest("hex"),
        });
        await context.close();
      }
} finally {
  await browser.close();
}
await writeFile(
  resolve(OUTPUT, "capture.json"),
  `${JSON.stringify({ source: "scripts/showcase/landing/capture.mjs", captures: records }, null, 2)}\n`,
);
console.log(`Saved ${records.length} captures to ${OUTPUT}`);
