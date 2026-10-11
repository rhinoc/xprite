import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SSR_LAYOUT_EFFECT_WARNING = "Warning: useLayoutEffect does nothing on the server";
const GROWTH_OUTPUT = "apps/growth/dist";
// Static pages are ~0.4 MB. Crawlers stop reading HTML at 15 MB; keep a wide margin.
const MAX_HTML_BYTES = 1024 * 1024;
// Theme cursors belong in the shared stylesheet; inline they cost ~0.5 MB per rendered scope.
const INLINE_CURSOR_ARTWORK = /style="[^"]*--ui-cursor-[\w-]+:url\(/;
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const build = spawn(packageManager, ["run", "build:growth"], {
  stdio: ["inherit", "pipe", "pipe"],
  windowsHide: true,
});

let warningFound = false;
let spawnFailed = false;

function forward(source, destination) {
  let overlap = "";
  source.setEncoding("utf8");
  source.on("data", (chunk) => {
    destination.write(chunk);
    const output = overlap + chunk;
    if (output.includes(SSR_LAYOUT_EFFECT_WARNING)) warningFound = true;
    overlap = output.slice(-SSR_LAYOUT_EFFECT_WARNING.length);
  });
}

forward(build.stdout, process.stdout);
forward(build.stderr, process.stderr);

build.on("error", (error) => {
  spawnFailed = true;
  console.error(`Unable to start Growth SSG build: ${error.message}`);
});

build.on("close", (code) => {
  if (spawnFailed) {
    process.exitCode = 1;
    return;
  }
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  if (warningFound) {
    console.error(
      "Growth SSG emitted React's useLayoutEffect server-render warning; pre-push is blocked.",
    );
    process.exitCode = 1;
  }
  for (const page of htmlPages(GROWTH_OUTPUT)) {
    const html = readFileSync(page);
    if (html.length > MAX_HTML_BYTES) {
      console.error(`${page} is ${html.length} bytes; static pages must stay under 1 MiB.`);
      process.exitCode = 1;
    }
    if (INLINE_CURSOR_ARTWORK.test(html.toString("utf8"))) {
      console.error(`${page} inlines theme cursor artwork in a style attribute.`);
      process.exitCode = 1;
    }
  }
});

function htmlPages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlPages(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}
