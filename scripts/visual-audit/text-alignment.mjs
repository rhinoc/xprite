#!/usr/bin/env node
// Cross-script vertical text alignment guard (en, zh-CN, ja) for every text-rendering control.
// Opens the alignment probe (`/components/?alignment-probe=<lang>`) at 3x device scale, once with
// normal text and once with transparent text, and diffs the two captures so only the label ink is
// measured (frames, boxes and arrows cancel). For each of checkbox, radio, input, button, select,
// tabs, control label and inline text it requires the CJK ink to be centred on the Latin ink within one device pixel (1/3 CSS px)
// and prints the top, bottom and centre rows in CSS px.
// Usage: node scripts/visual-audit/text-alignment.mjs [--theme id] [--keep dir] [--tolerance px] [--cjk-offset px] [--port n]
// Port: --port, else XPRITE_VISUAL_PORT (default 5173).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { BROWSER_ARGS, HIDDEN_DEFAULT_ARGS } = await import("./base/browser.mjs");
const { PNG } = require("pngjs");
const argument = (name) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const port = argument("--port") ?? process.env.XPRITE_VISUAL_PORT ?? "5173";
const keep = argument("--keep");
const theme = argument("--theme");
const SCALE = 3;
// Tuning aid: force a CJK offset (CSS px at scale 2) on every element instead of the theme value.
const forcedOffset = argument("--cjk-offset");
const TOLERANCE = Number(argument("--tolerance") ?? 1 / SCALE) + 1e-6;
const LANGUAGES = ["en", "zh-CN", "ja"];
const NAMES = ["checkbox", "radio", "input", "button", "select", "tabs", "label", "inline"];
const HIDE_TEXT =
  "[data-font],[data-font] *,[data-slot=button-content],[data-slot=button-content] *,[data-slot=inline-text],[data-slot=inline-text] *{color:transparent!important;-webkit-text-fill-color:transparent!important;background-color:transparent!important}";
if (keep) mkdirSync(keep, { recursive: true });

// The same pinned Chromium (flags, shared server) as every other visual audit.
const browser = process.env.XPRITE_VISUAL_BROWSER_WS
  ? await chromium.connect(process.env.XPRITE_VISUAL_BROWSER_WS)
  : await chromium.launch({
      headless: true,
      executablePath: process.env.XPRITE_CHROME || undefined,
      args: BROWSER_ARGS,
      ignoreDefaultArgs: HIDDEN_DEFAULT_ARGS,
    });

async function capture(lang, hideText) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 560 },
    deviceScaleFactor: SCALE,
    locale: lang === "zh-CN" ? "zh-CN" : lang,
  });
  try {
    const page = await context.newPage();
    if (theme)
      await page.addInitScript(
        (id) => localStorage.setItem("xprite.components.appearance", JSON.stringify({ theme: id })),
        theme,
      );
    await page.goto(
      `http://127.0.0.1:${port}/components/?alignment-probe=${lang}${theme && theme !== "macintosh" ? "&select-height=16" : ""}`,
    );
    await page.waitForSelector("[data-alignment-probe=tabs] [role=tab]", {
      timeout: 30000,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    if (forcedOffset !== undefined)
      await page.addStyleTag({
        content: `*{--ui-cjk-text-offset-y:${forcedOffset}px!important}`,
      });
    if (hideText) await page.addStyleTag({ content: HIDE_TEXT });
    await page.mouse.move(300, 550);
    const rows = {};
    for (const name of NAMES) {
      const box = await page.locator(`[data-alignment-probe=${name}]`).boundingBox();
      rows[name] = box;
    }
    const buffer = await page.screenshot();
    return { png: PNG.sync.read(buffer), rows, buffer };
  } finally {
    await context.close();
  }
}

function ink(shown, hidden, box) {
  const x0 = Math.floor(box.x * SCALE);
  const x1 = Math.ceil((box.x + box.width) * SCALE);
  const y0 = Math.floor((box.y - 6) * SCALE);
  const y1 = Math.ceil((box.y + box.height + 6) * SCALE);
  let top = Infinity;
  let bottom = -1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * shown.width + x) * 4;
      const delta =
        Math.abs(shown.data[i] - hidden.data[i]) +
        Math.abs(shown.data[i + 1] - hidden.data[i + 1]) +
        Math.abs(shown.data[i + 2] - hidden.data[i + 2]);
      if (delta < 60) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
    }
  if (bottom < 0) return null;
  return {
    top: top / SCALE,
    bottom: bottom / SCALE,
    mid: (top + bottom) / 2 / SCALE,
  };
}

const results = {};
try {
  for (const lang of LANGUAGES) {
    const shown = await capture(lang, false);
    const hidden = await capture(lang, true);
    if (keep) {
      writeFileSync(`${keep}/${theme ?? "default"}-${lang}.png`, shown.buffer);
      writeFileSync(`${keep}/${theme ?? "default"}-${lang}-hidden.png`, hidden.buffer);
    }
    results[lang] = Object.fromEntries(
      NAMES.map((name) => [name, ink(shown.png, hidden.png, shown.rows[name])]),
    );
  }
} finally {
  await browser.close();
}

let failed = false;
console.log(`theme ${theme ?? "default"}, tolerance ${TOLERANCE.toFixed(2)} CSS px (1 device px)`);
for (const name of NAMES) {
  const base = results.en[name];
  if (!base) {
    // A row a theme does not render (for example a control the skin has no artwork for) is a
    // failure only on the default Macintosh skin, which must render every probe.
    console.log(`${name.padEnd(8)} not rendered by this theme`);
    if (!theme || theme === "macintosh") failed = true;
    continue;
  }
  const cells = [`${name.padEnd(8)} en ${base.top}-${base.bottom} mid ${base.mid.toFixed(2)}`];
  for (const lang of LANGUAGES.slice(1)) {
    const r = results[lang][name];
    if (!r) {
      cells.push(`${lang} missing FAIL`);
      failed = true;
      continue;
    }
    const delta = r.mid - base.mid;
    const ok = Math.abs(delta) <= TOLERANCE;
    if (!ok) failed = true;
    cells.push(
      `${lang} ${r.top}-${r.bottom} mid ${r.mid.toFixed(2)} Δ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ${ok ? "ok" : "FAIL"}`,
    );
  }
  console.log(cells.join(" | "));
}
process.exit(failed ? 1 : 0);
