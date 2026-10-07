import fs from "node:fs/promises";
import path from "node:path";

import { saveScreenshot } from "../../base/screenshot.mjs";

const DEFAULT_SERVER = "http://127.0.0.1:4444";
const DEFAULT_SELECTOR = ".xse-root";
const REQUEST_TIMEOUT_MS = 30000;
const ELEMENT_ID = "element-6066-11e4-a52e-4f735466cecf";
const HELP = `Capture the current authorized iPad Safari page without changing its UI.

node scripts/showcase/ipad/capture-surface.mjs \\
  --session SESSION_ID --output /tmp/xprite-captures/home.png

Options:
  --session   Existing Safari WebDriver session ID (required; never saved).
  --output    New PNG path; a sibling .json stores capture geometry (required).
  --server    Local WebDriver server (default: ${DEFAULT_SERVER}).
  --selector  Surface element (default: ${DEFAULT_SELECTOR}).
  --help      Print these instructions.

The tool does not start Safari, create a session, navigate, edit controls,
change CSS or storage, or replace existing files.`;

function parseArguments() {
  const options = { server: DEFAULT_SERVER, selector: DEFAULT_SELECTOR };
  const supported = new Set(["session", "output", "server", "selector"]);
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--help") return null;
    const key = args[index].replace(/^--/, "");
    const value = args[index + 1];
    if (!args[index].startsWith("--") || !supported.has(key) || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument: ${args[index]}. Use --help for usage.`);
    }
    options[key] = value;
    index += 1;
  }
  if (!options.session || !options.output) throw new Error("--session and --output are required.");
  if (path.extname(options.output).toLowerCase() !== ".png") {
    throw new Error("--output must name a new .png file.");
  }
  const server = new URL(options.server);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(server.hostname) ||
    server.protocol !== "http:" ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    server.pathname !== "/"
  ) {
    throw new Error(
      "--server must be an HTTP WebDriver server on this computer's loopback interface.",
    );
  }
  return { ...options, server: server.origin, output: path.resolve(options.output) };
}

// Runs in the current page. Read only: no app internals, style edits, or storage access.
function measureSurface(selector) {
  const surface = document.querySelector(selector);
  if (!surface) throw new Error("Capture surface was not found in the current tab.");
  const surfaceBounds = surface.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  const rect = (element) => {
    const bounds = element.getBoundingClientRect();
    const relative = {
      x: bounds.x - surfaceBounds.x,
      y: bounds.y - surfaceBounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    return {
      viewportCss: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      surfaceCss: relative,
      surfacePixels: Object.fromEntries(
        Object.entries(relative).map(([key, value]) => [key, value * dpr]),
      ),
    };
  };
  const controlLabels = new Set([
    "New File...",
    "新建文件...",
    "File name",
    "文件名",
    "Width",
    "宽度",
    "Height",
    "高度",
    "RGBA",
    "White",
    "白色",
    "Transparent",
    "透明",
    "OK",
    "确定",
    "Cancel",
    "取消",
    "Play animation",
    "播放动画",
    "Stop playback",
    "停止播放",
    "First frame",
    "第一帧",
    "Previous frame",
    "上一帧",
    "Next frame",
    "下一帧",
    "Last frame",
    "最后一帧",
    "Add frame",
    "添加帧",
    "Current frame",
    "当前帧",
    "Zoom",
    "缩放",
  ]);
  const controls = [...surface.querySelectorAll("button, input")].flatMap((element) => {
    const label = element.getAttribute("aria-label") ?? "";
    const source = element.getAttribute("data-label-source") ?? "";
    if (!controlLabels.has(label) && !controlLabels.has(source)) return [];
    return [
      {
        tag: element.tagName.toLowerCase(),
        label,
        source,
        disabled: element.disabled,
        pressed: element.getAttribute("aria-pressed"),
        geometry: rect(element),
      },
    ];
  });
  const canvases = [...surface.querySelectorAll("canvas[data-editor-canvas]")].map((canvas) => ({
    geometry: rect(canvas),
    bitmap: { width: canvas.width, height: canvas.height },
  }));
  const visual = window.visualViewport;
  return {
    source: `${location.origin}${location.pathname}`,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: dpr,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      visualViewport: visual
        ? {
            width: visual.width,
            height: visual.height,
            scale: visual.scale,
            offsetLeft: visual.offsetLeft,
            offsetTop: visual.offsetTop,
            pageLeft: visual.pageLeft,
            pageTop: visual.pageTop,
          }
        : null,
    },
    surface: { selector, geometry: rect(surface) },
    canvases,
    controls,
  };
}

async function ensureNewFile(filename) {
  try {
    await fs.access(filename);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Output already exists; choose a new filename: ${filename}`);
}

async function main() {
  const options = parseArguments();
  if (!options) return console.log(HELP);
  const metadataPath = options.output.replace(/\.png$/i, ".json");
  await Promise.all([ensureNewFile(options.output), ensureNewFile(metadataPath)]);
  const sessionUrl = `${options.server}/session/${encodeURIComponent(options.session)}`;
  const request = async (endpoint, body) => {
    const response = await fetch(`${sessionUrl}${endpoint}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const result = await response.json();
    if (!response.ok || result.value?.error) {
      throw new Error(`WebDriver capture failed (${result.value?.error ?? response.status}).`);
    }
    return result.value;
  };
  await request("/execute/async", {
    script:
      "const done = arguments[arguments.length - 1]; document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => done(true))));",
    args: [],
  });
  const metadata = await request("/execute/sync", {
    script: `return (${measureSurface.toString()})(arguments[0]);`,
    args: [options.selector],
  });
  const bounds = metadata.surface.geometry.viewportCss;
  if (bounds.width <= 0 || bounds.height <= 0)
    throw new Error("Capture surface has no visible area.");
  const element = await request("/element", { using: "css selector", value: options.selector });
  const data = Buffer.from(
    await request(`/element/${encodeURIComponent(element[ELEMENT_ID])}/screenshot`),
    "base64",
  );
  const afterCapture = await request("/execute/sync", {
    script: `return (${measureSurface.toString()})(arguments[0]);`,
    args: [options.selector],
  });
  if (
    JSON.stringify(afterCapture.viewport) !== JSON.stringify(metadata.viewport) ||
    JSON.stringify(afterCapture.surface.geometry.viewportCss) !== JSON.stringify(bounds)
  )
    throw new Error("Safari changed the capture geometry during the element screenshot.");
  const screenshot = await saveScreenshot(data, {
    path: options.output,
    viewport: {
      width: metadata.viewport.innerWidth,
      height: metadata.viewport.innerHeight,
      dpr: metadata.viewport.devicePixelRatio,
    },
    clip: bounds,
    expectedDpr: metadata.viewport.devicePixelRatio,
    method: "Safari WebDriver element screenshot",
    metadataPath: null,
    exclusive: true,
  });
  const capture = {
    capturedAt: new Date().toISOString(),
    method: "Safari WebDriver element screenshot",
    image: {
      filename: path.basename(options.output),
      width: screenshot.pixels.width,
      height: screenshot.pixels.height,
    },
    ...metadata,
    capture: screenshot,
  };
  await fs.writeFile(metadataPath, `${JSON.stringify(capture, null, 2)}\n`, { flag: "wx" });
  console.log(
    JSON.stringify(
      {
        image: options.output,
        metadata: metadataPath,
        width: capture.image.width,
        height: capture.image.height,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
