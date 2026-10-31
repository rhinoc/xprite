import os from "node:os";

// Cross-platform browser for the visual audits: Playwright's bundled headless Chromium.
//
// Capture payloads (`*/capture.payload.mjs`) were written for the macOS-only ego-browser `nodejs`
// runner. This module runs the same payloads in-process with the small slice of that API they use
// (`taskSpace`, `task.page()`, `page.cdp()`, `label` options on pointer actions) on top of
// Playwright, so every OS produces the same pixels:
//   - one pinned Chromium build (the Playwright version in pnpm-lock.yaml),
//   - fixed DPR 1, light color scheme, UTC, en-US locale, sRGB, no LCD text, no font hinting,
//     hidden scrollbars, no GPU,
//   - a pinned Linux user agent and navigator.platform, so platform-dependent UI (shortcut labels,
//     Ctrl vs Cmd) renders identically on macOS, Linux and Windows,
//   - `ControlOrMeta` shortcuts always press Control, matching the pinned platform.
// The page itself only loads fonts bundled in the repository.
//
// XPRITE_VISUAL_BROWSER_WS (set by scripts/visual-audit/run-pre-push.mjs) makes every audit share
// one browser process; without it each audit launches its own.
import { chromium } from "playwright";

// Playwright launches headless Chromium with --hide-scrollbars; users see scrollbars (thumb and
// track), so captures must too, or scrollbar regressions are invisible.
export const HIDDEN_DEFAULT_ARGS = ["--hide-scrollbars"];
export const BROWSER_ARGS = [
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
  "--disable-lcd-text",
  "--disable-font-subpixel-positioning",
  "--disable-gpu",
  "--disable-skia-runtime-opts",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
];
export const PINNED_PLATFORM = "Linux x86_64";

export async function launchBrowserServer() {
  return chromium.launchServer({
    headless: true,
    args: BROWSER_ARGS,
    ignoreDefaultArgs: HIDDEN_DEFAULT_ARGS,
  });
}

async function openBrowser() {
  const endpoint = process.env.XPRITE_VISUAL_BROWSER_WS;
  if (endpoint) {
    const browser = await chromium.connect(endpoint);
    return { browser, close: () => browser.close() };
  }
  const browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
    ignoreDefaultArgs: HIDDEN_DEFAULT_ARGS,
  });
  return { browser, close: () => browser.close() };
}

const withoutLabel = (options) => {
  if (!options || typeof options !== "object") return options;
  const { label: _label, ...rest } = options;
  return rest;
};
const pinnedKeys = (keys) => keys.replaceAll("ControlOrMeta", "Control");

function egoPage(page, context) {
  let session;
  const cdp = async (method, params = {}) => {
    // Page.addScriptToEvaluateOnNewDocument only applies once the session enables Page.
    session ??= context.newCDPSession(page).then(async (created) => {
      await created.send("Page.enable");
      return created;
    });
    return (await session).send(method, params);
  };
  const mouse = new Proxy(page.mouse, {
    get(target, property) {
      if (property === "move") return (x, y, options) => target.move(x, y, withoutLabel(options));
      if (property === "click") return (x, y, options) => target.click(x, y, withoutLabel(options));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const keyboard = new Proxy(page.keyboard, {
    get(target, property) {
      if (property === "press")
        return (keys, options) => target.press(pinnedKeys(keys), withoutLabel(options));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(page, {
    get(target, property) {
      if (property === "cdp") return cdp;
      if (property === "mouse") return mouse;
      if (property === "keyboard") return keyboard;
      if (["hover", "click", "dblclick", "focus", "fill", "check", "tap"].includes(property))
        return (selector, ...rest) =>
          target[property](selector, ...rest.map((value) => withoutLabel(value)));
      if (property === "press")
        return (selector, keys, options) =>
          target.press(selector, pinnedKeys(keys), withoutLabel(options));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Run an ego-style capture payload. `globals` become top-level bindings (for example
 * `{ captureConfig }`). Lines matching `forward` are echoed live, like the old ego wrappers did.
 * Resolves to `{ status, stdout, stderr }`; a thrown payload error yields status 1.
 */
export async function runBrowserPayload({ payload, globals, forward = /^$/ }) {
  const { browser, close } = await openBrowser();
  const version = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`,
  });
  await context.addInitScript((platform) => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => platform });
  }, PINNED_PLATFORM);
  context.setDefaultTimeout(30_000);
  const pages = new Map();
  const output = { stdout: "", stderr: "" };
  const write = (stream, values) => {
    const line = values
      .map((value) => (typeof value === "string" ? value : String(value)))
      .join(" ");
    output[stream] += `${line}\n`;
    if (forward.test(line)) process.stdout.write(`${line}\n`);
  };
  const payloadConsole = {
    log: (...values) => write("stdout", values),
    info: (...values) => write("stdout", values),
    warn: (...values) => write("stderr", values),
    error: (...values) => write("stderr", values),
  };
  let nextSpace = 1;
  const taskSpace = async () => ({
    ownership: "agent",
    spaceId: nextSpace++,
    page(name = "p1") {
      if (!pages.has(name))
        pages.set(
          name,
          context.newPage().then((page) => egoPage(page, context)),
        );
      return pages.get(name);
    },
    async finish() {},
  });
  // Payloads call `task.page("p1")` synchronously; open the first page up front.
  const firstPage = await context.newPage();
  if (process.env.XPRITE_VISUAL_DEBUG) {
    firstPage.on("pageerror", (error) => console.error(`[page error] ${error.message}`));
    firstPage.on("requestfailed", (request) =>
      console.error(`[request failed] ${request.url()} ${request.failure()?.errorText}`),
    );
    firstPage.on("console", (message) => console.error(`[console] ${message.text()}`));
  }
  const first = egoPage(firstPage, context);
  pages.set("p1", Promise.resolve(first));
  const syncTaskSpace = async (label) => {
    const space = await taskSpace(label);
    return { ...space, page: (name = "p1") => (name === "p1" ? first : space.page(name)) };
  };
  const names = Object.keys(globals);
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  let status = 0;
  try {
    await new AsyncFunction("taskSpace", "console", ...names, payload)(
      syncTaskSpace,
      payloadConsole,
      ...names.map((name) => globals[name]),
    );
  } catch (error) {
    status = 1;
    write("stderr", [
      error instanceof Error ? `Error: ${error.message}\n${error.stack ?? ""}` : String(error),
    ]);
  } finally {
    await context.close().catch(() => {});
    await close().catch(() => {});
  }
  return { status, ...output };
}

const MAX_AUDIT_SHARDS = 2;

/** Each audit uses at most two pages by default; the orchestrator runs two audit groups. */
export function visualShardCount(scenes) {
  const requested = Number(
    process.env.XPRITE_VISUAL_SHARDS ??
      Math.max(1, Math.min(MAX_AUDIT_SHARDS, Math.floor(os.availableParallelism() / 2))),
  );
  return Math.max(1, Math.min(scenes, requested));
}
