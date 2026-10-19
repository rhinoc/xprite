#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
// Embedding regression check (itch.io shows the editor in a phone-sized iframe whose height can
// be 0 while the host lays out). Serves a built editor on localhost, hosts it in iframes of
// awkward sizes, also resizes them live, and fails if the app error boundary appears or React
// reports a render loop (#185 "Maximum update depth exceeded").
//   node scripts/e2e/zero-height-iframe.mjs [builtEditorDirectory]   (default apps/editor/dist)
import http from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const directory = resolve(root, process.argv[2] ?? "apps/editor/dist");
const types = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
};
const SETTLE_MS = 6_000;
const AFTER_RESIZE_MS = 3_000;
// [iframe width, iframe height, optional live resize [width, height]]
const CASES = [
  [390, 0, null],
  [390, 0, [390, 844]],
  [390, 1, null],
  [390, 844, [390, 0]],
  [0, 0, null],
];

let size = { width: 390, height: 0 };
const server = http
  .createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (path === "/host.html") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        `<body style="margin:0"><iframe id="f" src="/editor/" style="width:${size.width}px;height:${size.height}px;border:0"></iframe>`,
      );
      return;
    }
    let file = join(directory, path);
    try {
      if (statSync(file).isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(directory, "index.html");
    }
    try {
      response.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
      });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404);
      response.end();
    }
  })
  .listen(0, "127.0.0.1");
await new Promise((done) => server.once("listening", done));
const origin = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
let failures = 0;
try {
  for (const [width, height, resize] of CASES) {
    size = { width, height };
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
    page.on("console", (message) => {
      if (message.type() === "error" && /#185|Maximum update depth/i.test(message.text()))
        problems.push(`console: ${message.text().slice(0, 200)}`);
    });
    await page.goto(`${origin}/host.html`);
    await page.waitForTimeout(SETTLE_MS);
    if (resize) {
      await page.evaluate(([w, h]) => {
        const frame = document.getElementById("f");
        frame.style.width = `${w}px`;
        frame.style.height = `${h}px`;
      }, resize);
      await page.waitForTimeout(AFTER_RESIZE_MS);
    }
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    const state = await frame.evaluate(() => ({
      errorScreen: document.body.innerText.includes("Editor error"),
      mounted: (document.getElementById("root")?.childElementCount ?? 0) > 0,
    }));
    const failed = state.errorScreen || !state.mounted || problems.length > 0;
    if (failed) failures++;
    console.log(
      `${failed ? "FAIL" : "PASS"} iframe ${width}x${height}${resize ? ` -> ${resize.join("x")}` : ""}`,
      JSON.stringify({ ...state, problems }),
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures) process.exit(1);
