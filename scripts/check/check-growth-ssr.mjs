import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SSR_LAYOUT_EFFECT_WARNING = "Warning: useLayoutEffect does nothing on the server";
// Both apps prerender pages with the UI package; check each build's warnings and HTML.
const BUILDS = [
  { name: "Growth", script: "build:growth", output: "apps/growth/dist", log: "growth" },
  { name: "Tools", script: "build:tools", output: "apps/tools/dist", log: "tools" },
];
// --prebuilt: check the output and build log of this run's `pnpm run build:site`
// (scripts/build/site.mjs writes .tmp/build-logs/<app>.log) instead of building again.
const prebuilt = process.argv.includes("--prebuilt");
// Static pages are 0.25-0.6 MB. Crawlers stop reading HTML at 15 MB; keep a wide margin.
const MAX_HTML_BYTES = 1024 * 1024;
// Theme cursors belong in the shared stylesheet; inline they cost ~0.5 MB per rendered scope.
const INLINE_CURSOR_ARTWORK = /style="[^"]*--ui-cursor-[\w-]+:url\(/;
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function forward(source, destination, onWarning) {
  let overlap = "";
  source.setEncoding("utf8");
  source.on("data", (chunk) => {
    destination.write(chunk);
    const output = overlap + chunk;
    if (output.includes(SSR_LAYOUT_EFFECT_WARNING)) onWarning();
    overlap = output.slice(-SSR_LAYOUT_EFFECT_WARNING.length);
  });
}

function readLog({ name, log }) {
  const file = `.tmp/build-logs/${log}.log`;
  if (!existsSync(file)) {
    console.error(`${file} is missing; run pnpm run build:site first.`);
    return 1;
  }
  if (readFileSync(file, "utf8").includes(SSR_LAYOUT_EFFECT_WARNING)) {
    console.error(
      `${name} SSG emitted React's useLayoutEffect server-render warning; pre-push is blocked.`,
    );
    return 1;
  }
  return 0;
}

function run({ name, script }) {
  return new Promise((resolve) => {
    const build = spawn(packageManager, ["run", script], {
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
    });
    let warningFound = false;
    const onWarning = () => {
      warningFound = true;
    };
    forward(build.stdout, process.stdout, onWarning);
    forward(build.stderr, process.stderr, onWarning);
    build.on("error", (error) => {
      console.error(`Unable to start ${name} SSG build: ${error.message}`);
      resolve(1);
    });
    build.on("close", (code) => {
      if (code !== 0) return resolve(code ?? 1);
      if (warningFound) {
        console.error(
          `${name} SSG emitted React's useLayoutEffect server-render warning; pre-push is blocked.`,
        );
        return resolve(1);
      }
      resolve(0);
    });
  });
}

function htmlPages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlPages(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

for (const build of BUILDS) {
  const code = prebuilt ? readLog(build) : await run(build);
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
  for (const page of htmlPages(build.output)) {
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
}
