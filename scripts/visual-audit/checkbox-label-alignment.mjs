#!/usr/bin/env node
import { mkdirSync } from "node:fs";
// DOM + ink measurement guard for checkbox label alignment (zh-CN, ja, en).
// Opens the ACNH tool on a running site (XPRITE_VISUAL_PORT, default 5173), takes a 3x capture of the
// "Tile grid" checkbox row and requires, in CSS px, that the label glyph ink (a) is fully visible
// inside the 12px box band, (b) is vertically centred on the box within 1px and (c) shares top/bottom
// ink rows with the neighbouring zoom label within 0.34px (one device pixel).
// Usage: node scripts/visual-audit/checkbox-label-alignment.mjs [--keep dir]
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const port = process.env.XPRITE_VISUAL_PORT ?? "5173";
const keep = process.argv.includes("--keep")
  ? process.argv[process.argv.indexOf("--keep") + 1]
  : null;
if (keep) mkdirSync(keep, { recursive: true });
const SCALE = 3;
// Rows above this are ignored (window chrome above the row).
const BAND_TOP = 3 * SCALE;
const browser = await chromium.launch({
  executablePath: process.env.XPRITE_CHROME || undefined,
  args: ["--no-sandbox"],
});
let failed = false;
try {
  for (const lang of ["zh-CN", "ja", "en"]) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 700 },
      deviceScaleFactor: SCALE,
      locale: lang,
    });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${port}/tools/animal-crossing-qr/`;
    await page.goto(url);
    await page.evaluate((l) => localStorage.setItem("xse.ui.language.v1", l), lang);
    await page.reload();
    await page.waitForTimeout(2500);
    await page.locator("[data-tool-drop-stage] button").nth(1).click();
    const box = page.locator("button[role=checkbox]").first();
    await box.waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    // Hide the tile preview so its bottom edge cannot bleed into the measured rows.
    await page.addStyleTag({ content: "canvas, img { visibility: hidden !important; }" });
    const r = await box.boundingBox();
    const clip = { x: r.x - 4, y: r.y - 6, width: r.width + 170, height: r.height + 12 };
    const buffer = await page.screenshot({ clip, path: keep ? `${keep}/${lang}.png` : undefined });
    const png = PNG.sync.read(buffer);
    const dark = (x, y) => {
      const i = (y * png.width + x) * 4;
      return (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3 < 110;
    };
    const cols = [];
    for (let x = 0; x < png.width; x++)
      for (let y = BAND_TOP; y < png.height; y++)
        if (dark(x, y)) {
          cols.push(x);
          break;
        }
    // Ink columns after the 12px control icon, split into runs separated by gaps wider than 3px.
    const iconEnd = Math.round((4 + 14) * SCALE);
    const runs = [];
    for (const x of cols.filter((x) => x >= iconEnd)) {
      const last = runs.at(-1);
      if (last && x - last[1] <= 3 * SCALE) last[1] = x;
      else runs.push([x, x]);
    }
    const rows = ([a, b]) => {
      let top = Infinity,
        bottom = -1;
      for (let y = BAND_TOP; y < png.height; y++)
        for (let x = a; x <= b; x++)
          if (dark(x, y)) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y + 1);
            break;
          }
      return { top: top / SCALE, bottom: bottom / SCALE };
    };
    const labelEnd = Math.round((4 + r.width) * SCALE);
    const labelRuns = runs.filter(([a]) => a < labelEnd - 4);
    const zoomRun = runs.find(([a]) => a >= labelEnd - 4);
    if (!labelRuns.length || !zoomRun) throw new Error(`${lang}: label or zoom ink not found`);
    const label = rows([labelRuns[0][0], labelRuns.at(-1)[1]]);
    const zoom = rows(zoomRun);
    const boxTop = 6,
      boxBottom = 6 + r.height;
    const centre = (label.top + label.bottom) / 2 - (boxTop + boxBottom) / 2;
    const problems = [];
    if (label.top < boxTop - 1.01 || label.bottom > boxBottom + 3)
      problems.push("label ink outside the box band (clipped or too high)");
    if (Math.abs(centre) > 1.01 && lang !== "en")
      problems.push(`label centre off box centre by ${centre.toFixed(2)}px`);
    // Latin descenders (g) make bottoms differ; compare tops for en, tops and bottoms for CJK.
    if (Math.abs(label.top - zoom.top) > 0.34 + 1e-6)
      problems.push(`label top ${label.top} vs zoom top ${zoom.top}`);
    if (lang !== "en" && Math.abs(label.bottom - zoom.bottom) > 0.34 + 1e-6)
      problems.push(`label bottom ${label.bottom} vs zoom bottom ${zoom.bottom}`);
    console.log(
      `${lang}: label ${label.top}-${label.bottom} zoom ${zoom.top}-${zoom.bottom} box ${boxTop}-${boxBottom} centreΔ ${centre.toFixed(2)} ${problems.length ? "FAIL " + problems.join("; ") : "ok"}`,
    );
    if (problems.length) failed = true;
    await context.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
