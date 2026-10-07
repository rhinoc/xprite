import { installWechatCanvasBridge } from "@xprite/wechat-app/runtime/canvas";
import { installWechatEnvironment } from "@xprite/wechat-app/runtime/environment";
import { installWechatFonts } from "@xprite/wechat-app/runtime/fonts";
import { installWechatGeometryBridge } from "@xprite/wechat-app/runtime/geometry";

const REPORT_STORAGE_KEY = "xprite:wechat:runtime-probe";
const NATIVE_NODE_SETTLE_MS = 300;
const GEOMETRY_WIDTH = 120;
const GEOMETRY_HEIGHT = 40;
const CANVAS_SIZE = 4;

/** Developer-only native runtime investigation; never an editor/product entry. */
export default function createApp() {
  const report = { geometry: {}, canvas: {}, browserApis: {}, failures: [], runtimeErrors: [] };
  let geometry;
  const output = document.createElement("div");
  output.style.cssText =
    "white-space:pre-wrap;padding:16px;font-size:12px;color:#ddd;background:#202125;";
  const box = document.createElement("div");
  box.id = "geometry-probe";
  box.style.cssText = `width:${GEOMETRY_WIDTH}px;height:${GEOMETRY_HEIGHT}px;background:#85c6a1;`;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("type", "2d");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  document.body.appendChild(box);
  document.body.appendChild(canvas);
  document.body.appendChild(output);

  function publish() {
    output.textContent = "";
    for (const [section, entries] of Object.entries(report)) {
      if (Array.isArray(entries)) {
        const line = document.createElement("div");
        line.textContent = `${section}: ${JSON.stringify(entries)}`;
        output.appendChild(line);
      } else
        for (const [name, value] of Object.entries(entries)) {
          const line = document.createElement("div");
          line.textContent = `${section}.${name}: ${JSON.stringify(value)}`;
          output.appendChild(line);
        }
    }
    wx.setStorageSync(REPORT_STORAGE_KEY, report);
    console.log("Xprite WeChat runtime investigation", report);
  }
  window.addEventListener("error", (event) => {
    report.runtimeErrors.push(String(event.error ?? event.message ?? event));
    publish();
  });
  window.addEventListener("unhandledrejection", (event) => {
    report.runtimeErrors.push(String(event.reason));
    publish();
  });

  const timer = setTimeout(async () => {
    try {
      const rect = box.getBoundingClientRect();
      report.geometry.synchronousRect = { width: rect.width ?? null, height: rect.height ?? null };
      const style = window.getComputedStyle(box);
      report.geometry.synchronousStyle = style
        ? { width: style.width, height: style.height }
        : null;
      const nativeRect = await box.$$getBoundingClientRect();
      report.geometry.nativeRect = { width: nativeRect.width, height: nativeRect.height };
      const nativeStyle = await window.$$getComputedStyle(box, ["width", "height", "box-sizing"]);
      report.geometry.nativeStyle = nativeStyle;
      report.geometry.matchesAuthoredSize =
        nativeRect.width === GEOMETRY_WIDTH && nativeRect.height === GEOMETRY_HEIGHT;
      report.geometry.synchronousParity =
        rect.width === nativeRect.width && rect.height === nativeRect.height && !!style;
    } catch (error) {
      report.failures.push({ operation: "geometry", message: String(error) });
    }

    try {
      report.canvas.immediateContext = !!canvas.getContext("2d");
      await canvas.$$prepare();
      const context = canvas.getContext("2d");
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 1, 1);
      report.canvas.preparedContext = !!context;
      report.canvas.pixel = Array.from(context.getImageData(0, 0, 1, 1).data);
      const detached = document.createElement("canvas");
      detached.width = CANVAS_SIZE;
      detached.height = CANVAS_SIZE;
      report.canvas.detachedContext = !!detached.getContext("2d");
    } catch (error) {
      report.failures.push({ operation: "canvas", message: String(error) });
    }

    for (const name of [
      "ResizeObserver",
      "MutationObserver",
      "PointerEvent",
      "ImageData",
      "DOMRect",
      "OffscreenCanvas",
    ])
      report.browserApis[name] = typeof window[name];
    for (const name of ["createRange", "elementFromPoint", "elementsFromPoint"])
      report.browserApis[`document.${name}`] = typeof document[name];
    report.browserApis["document.fonts"] = !!document.fonts;
    try {
      await installWechatFonts(window, wx, __XPRITE_PROBE_FONTS__);
      const faces = await document.fonts.load("10px FusionPixelZhHans", "中");
      report.browserApis.adaptedFontFamilies = faces.map((face) => face.family);
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: 16, height: 16 });
      const context = canvas.getContext("2d");
      context.font = "10px FusionPixelZhHans";
      context.textBaseline = "top";
      context.fillText("中", 0, 0);
      report.browserApis.adaptedCjkWidth = context.measureText("中").width;
      report.browserApis.adaptedCjkHasPixels = context
        .getImageData(0, 0, 16, 16)
        .data.some((value, index) => index % 4 === 3 && value > 0);
    } catch (error) {
      report.failures.push({ operation: "font-adapter", message: String(error) });
    }
    try {
      geometry = installWechatGeometryBridge(window);
      await geometry.flush([box]);
      const rect = box.getBoundingClientRect();
      const style = window.getComputedStyle(box);
      report.geometry.adaptedRect = { width: rect.width, height: rect.height };
      report.geometry.adaptedStyle = { width: style.width, height: style.height };
      let resized = null;
      const observer = new window.ResizeObserver((entries) => {
        resized = entries[0].contentRect.width;
      });
      observer.observe(box);
      box.style.width = "160px";
      await geometry.flush([box]);
      report.geometry.adaptedResizeWidth = resized;
      observer.disconnect();
      report.geometry.adaptedParity =
        rect.width === GEOMETRY_WIDTH && rect.height === GEOMETRY_HEIGHT && resized === 160;
    } catch (error) {
      report.failures.push({ operation: "geometry-adapter", message: String(error) });
    }
    try {
      const bridge = installWechatCanvasBridge(window, wx);
      const surface = document.createElement("canvas");
      surface.width = CANVAS_SIZE;
      surface.height = CANVAS_SIZE;
      const context = surface.getContext("2d");
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 1, 1);
      report.canvas.adaptedDetachedContext = !!context;
      report.canvas.adaptedDetachedPixel = Array.from(context.getImageData(0, 0, 1, 1).data);
      document.body.appendChild(surface);
      await bridge.flush();
      report.canvas.adaptedNativePixel = Array.from(
        surface.$$node.getContext("2d").getImageData(0, 0, 1, 1).data,
      );
    } catch (error) {
      report.failures.push({ operation: "canvas-adapter", message: String(error) });
    }
    try {
      installWechatEnvironment(window, wx);
      const container = document.createElement("div");
      document.body.insertBefore(container, document.body.firstChild);
      const { mountSharedControls } = await import("./shared-controls.tsx");
      await mountSharedControls(container, geometry);
      report.browserApis.sharedControlsMounted = true;
    } catch (error) {
      report.failures.push({ operation: "shared-controls", message: String(error) });
    }
    publish();
  }, NATIVE_NODE_SETTLE_MS);

  return { dispose: () => clearTimeout(timer) };
}
