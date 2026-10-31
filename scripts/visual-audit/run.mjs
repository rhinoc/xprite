// Runs every pre-push visual audit against one dev site and one shared headless Chromium.
//
//   node scripts/visual-audit/run.mjs        (pnpm run visual)
//
// - Starts `scripts/dev/site.mjs` once, or reuses servers that are already running for this
//   checkout (XPRITE_VISUAL_PORT, default 5173, is the unified editor port).
// - Warms each app so first-request module transforms do not count against capture timeouts.
// - Launches one Playwright Chromium server; every audit connects to it with its own context.
// - Runs startup continuity, editor capture→compare, SSG startup, and site capture→compare in
//   parallel, buffering each audit's output.
// XPRITE_SKIP_VISUAL=1 is an explicit opt-out; nothing is skipped by default.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import configuration from "../../infra/dev-site.json" with { type: "json" };
import { mapConcurrent } from "../base/map-concurrent.mjs";
import { BROWSER_ARGS, launchBrowserServer } from "./base/browser.mjs";
import { startStaticSite } from "./base/static-site.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]$/, "");
const AUDIT_GROUP_CONCURRENCY = 2;
const started = performance.now();
const seconds = (since) => ((performance.now() - since) / 1000).toFixed(1);

if (process.env.XPRITE_SKIP_VISUAL === "1") {
  console.log("Visual audits skipped: XPRITE_SKIP_VISUAL=1 was set explicitly.");
  process.exit(0);
}

const port = Number(process.env.XPRITE_VISUAL_PORT ?? configuration.ports.editor);
if (!Number.isInteger(port) || port < 1024 || port > 65532)
  throw Error("XPRITE_VISUAL_PORT must be an integer from 1024 to 65532.");
const appNames = Object.keys(configuration.ports);
const ports = Object.fromEntries(
  appNames.map((app, index) =>
    port === configuration.ports.editor ? [app, configuration.ports[app]] : [app, port + index],
  ),
);

async function serverReady(app) {
  try {
    const response = await fetch(`http://127.0.0.1:${ports[app]}${configuration.identityPath}`, {
      signal: AbortSignal.timeout(2000),
    });
    const identity = await response.json();
    return (
      response.ok && identity.app === app && path.resolve(identity.root) === path.resolve(root)
    );
  } catch {
    return false;
  }
}

async function startSite() {
  const already = (await Promise.all(appNames.map(serverReady))).every(Boolean);
  if (already) {
    console.log(`Reusing the running dev site on port ${port}.`);
    return undefined;
  }
  const child = spawn(process.execPath, ["scripts/dev/site.mjs"], {
    cwd: root,
    env:
      port === configuration.ports.editor
        ? process.env
        : { ...process.env, XPRITE_DEV_PORT_BASE: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await Promise.all(appNames.map(serverReady))).every(Boolean)) return { child, exited };
    if (child.exitCode !== null) break;
    await delay(250);
  }
  child.kill("SIGTERM");
  throw Error(`Dev site did not start on port ${port}:\n${log.slice(-4000)}`);
}

async function warm(endpoint) {
  const browser = await chromium.connect(endpoint);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const origin = `http://xprite-visual-warmup.localhost:${port}`;
  await Promise.all(
    [
      "/",
      "/about/",
      "/zh-CN/about/",
      "/help/",
      "/tools/viewer/",
      "/tools/pixelate/",
      "/components/",
    ].map(async (pathname) => {
      const page = await context.newPage();
      await page
        .goto(origin + pathname, { waitUntil: "networkidle", timeout: 90_000 })
        .catch(() => {});
      await page.close();
    }),
  );
  await context.close();
  await browser.close();
}

function run(name, steps, env) {
  const since = performance.now();
  return (async () => {
    let output = "";
    for (const args of steps) {
      const code = await new Promise((resolve) => {
        const child = spawn(process.execPath, args, { cwd: root, env });
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        child.once("error", (error) => {
          output += error.message;
          resolve(1);
        });
        child.once("close", (status) => resolve(status ?? 1));
      });
      if (code !== 0) {
        process.stdout.write(`[FAIL] ${name} (${seconds(since)}s)\n${output.trimEnd()}\n\n`);
        return { name, passed: false };
      }
    }
    process.stdout.write(`[ok  ] ${name} (${seconds(since)}s)\n`);
    return { name, passed: true };
  })();
}

const ts = ["--experimental-transform-types", "--no-warnings=ExperimentalWarning"];
const portArgs = ["--port", String(port)];
// Default: audit the production build (.tmp/site), served the way EdgeOne serves it. Pages load
// as a few hashed bundles instead of hundreds of dev-server module transforms, and what is
// audited is what deploys. `--prebuilt` reuses a build the caller just made (pre-push builds it
// once for both these audits and check:deploy); `--dev` audits the Vite dev site instead.
const useDev = process.argv.includes("--dev");
const siteRoot = path.join(root, ".tmp/site");
async function startStaticBuild() {
  if (!process.argv.includes("--prebuilt")) {
    const since = performance.now();
    const status = await new Promise((resolve) => {
      const child = spawn("pnpm", ["run", "build:site"], {
        cwd: root,
        stdio: "ignore",
      });
      child.once("close", (code) => resolve(code ?? 1));
    });
    if (status !== 0) throw Error("pnpm run build:site failed; run it directly for details.");
    console.log(`Site built in ${seconds(since)}s.`);
  }
  if (!fs.existsSync(path.join(siteRoot, "edgeone.json")))
    throw Error("No site build in .tmp/site; run `pnpm run build:site` first.");
  const server = await startStaticSite({ siteRoot, port });
  console.log(`Serving the production build from .tmp/site on port ${port}.`);
  return {
    child: {
      kill: () => {
        server.close();
        server.closeAllConnections();
      },
    },
    exited: new Promise((resolve) => server.on("close", resolve)),
  };
}
const site = useDev ? await startSite() : await startStaticBuild();
const server = await launchBrowserServer();
let failed = [];
try {
  const env = { ...process.env, XPRITE_VISUAL_BROWSER_WS: server.wsEndpoint() };
  const warmStarted = performance.now();
  if (useDev) {
    await warm(server.wsEndpoint());
    console.log(
      `Dev site ready and warmed in ${seconds(warmStarted)}s (Chromium ${BROWSER_ARGS.length} pinned flags).`,
    );
  }
  const audits = [
    () =>
      run(
        "startup continuity",
        [["scripts/visual-audit/startup-continuity/audit.mjs", ...portArgs]],
        env,
      ),
    () =>
      run(
        "editor capture + compare",
        [
          ["scripts/visual-audit/xprite/capture.mjs", ...portArgs],
          ["scripts/visual-audit/xprite/compare.mjs"],
        ],
        env,
      ),
    () =>
      run(
        "text alignment (zh/ja/en)",
        [["scripts/visual-audit/text-alignment.mjs", ...portArgs]],
        env,
      ),
    () =>
      run(
        "tools SSG startup",
        [["scripts/visual-audit/tools-startup/audit.mjs", ...portArgs]],
        env,
      ),
    () =>
      run(
        "site capture + compare",
        [
          [...ts, "scripts/visual-audit/site/audit.mjs", "capture", ...portArgs],
          [...ts, "scripts/visual-audit/site/audit.mjs", "compare"],
        ],
        env,
      ),
  ];
  const results = await mapConcurrent(audits, AUDIT_GROUP_CONCURRENCY, (audit) => audit());
  failed = results.filter(({ passed }) => !passed).map(({ name }) => name);
} finally {
  await server.close().catch(() => {});
  if (site) {
    site.child.kill("SIGTERM");
    // An unref'd timer: a pending fallback must not keep the process alive after exit.
    await Promise.race([site.exited, delay(10_000, undefined, { ref: false })]);
  }
}
if (failed.length > 0) {
  console.error(
    `\nvisual: ${failed.length} audit(s) failed in ${seconds(started)}s: ${failed.join(", ")}`,
  );
  console.error(
    "Reports: .tmp/visual-report/index.html, .tmp/site-visual, .tmp/startup-continuity",
  );
  process.exitCode = 1;
} else {
  console.log(`\nvisual: all audits passed in ${seconds(started)}s.`);
}
