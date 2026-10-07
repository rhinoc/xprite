import type { ReplayPort } from "$/managers/ports/replay";
import type { ReplayCursorAppearance } from "$/managers/ports/replay";
import { downloadBlob, isAbortError, pickOpenFiles } from "@xprite/bedrock/browser/file-system";
import { REPLAY_MAX_BYTES } from "@xprite/editor-core";
import { getCursorArtwork, type CursorRole } from "@xprite/ui/cursor";
import { clientDeltaToLocal, computedStyle, layoutSize, snapLocalToPixels } from "@xprite/ui/utils";

const REPLAY_BACKING_SCALE = 4;
const MAX_BACKING_PIXELS = 4 * 1024 * 1024;
const FRAME_DEADLINE_MS = 1000 / 60;
const SUSPEND_DELAY_MS = 250;
const EDITOR_CANVAS_SELECTOR = "canvas[data-editor-canvas]";
const REPLAY_CONTROLS_SELECTOR = "[data-replay-controls]";
const PRIVATE_INPUT_SELECTOR = 'input[type="password"], [data-private-input]';
const MAX_CURSOR_SIDE = 256;
const MODIFIER_LABELS: Readonly<Record<string, string>> = {
  Control: "Ctrl",
  Meta: "Cmd",
  Alt: "Alt",
  Shift: "Shift",
};

function cursorImage(source: string): { width: number; height: number } | null {
  try {
    let width: number, height: number;
    if (source.startsWith("data:image/svg+xml,")) {
      const svg = decodeURIComponent(source.slice(source.indexOf(",") + 1));
      width = Number(svg.match(/\bwidth=["']([\d.]+)(?:px)?["']/)?.[1]);
      height = Number(svg.match(/\bheight=["']([\d.]+)(?:px)?["']/)?.[1]);
    } else if (source.startsWith("data:image/png;base64,")) {
      const raw = atob(source.slice(source.indexOf(",") + 1));
      if (raw.length < 24) return null;
      const header = Uint8Array.from(raw.slice(0, 24), (character) => character.charCodeAt(0));
      const view = new DataView(header.buffer);
      width = view.getUint32(16);
      height = view.getUint32(20);
    } else return null;
    return [width, height].every(
      (size) => Number.isSafeInteger(size) && size > 0 && size <= MAX_CURSOR_SIDE,
    )
      ? { width, height }
      : null;
  } catch {
    return null;
  }
}

function nativeCursorRole(cursor: string): CursorRole {
  if (cursor.includes("grab")) return "hand";
  if (cursor.includes("zoom")) return "magnifier";
  if (cursor.includes("not-allowed")) return "forbidden";
  if (cursor.includes("move")) return "move";
  if (cursor === "ew-resize") return "size_we";
  if (cursor === "ns-resize") return "size_ns";
  if (cursor === "nwse-resize") return "size_nw";
  if (cursor === "nesw-resize") return "size_ne";
  if (cursor.includes("crosshair")) return "crosshair";
  return "normal";
}

async function chooseReplay(): Promise<Uint8Array | null> {
  const picker = pickOpenFiles({ multiple: false });
  let file: File | undefined;
  if (picker) {
    try {
      file = await (await picker)[0]?.getFile();
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  } else {
    file = await new Promise<File | undefined>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xprite-replay";
      input.hidden = true;
      const finish = () => {
        const selected = input.files?.[0];
        input.remove();
        resolve(selected);
      };
      input.addEventListener("change", finish, { once: true });
      input.addEventListener("cancel", finish, { once: true });
      document.body.append(input);
      input.click();
    });
  }
  if (!file) return null;
  if (file.size > REPLAY_MAX_BYTES)
    throw new RangeError("Replay files must be smaller than 256 MiB.");
  return new Uint8Array(await file.arrayBuffer());
}

export function createBrowserReplayPort(): ReplayPort {
  let activeCanvas: HTMLCanvasElement | null = null;
  let pointerType = "mouse";
  const modifiers = new Set<string>();
  let frameId = 0;
  const frameRequests = new Map<number, { animation: number; timer: number }>();
  const surfaces = new WeakMap<
    HTMLCanvasElement,
    { source: HTMLCanvasElement; pixels: object | null }
  >();
  return {
    observeInput(onKeys, onCursorChange) {
      const observer = new MutationObserver(() => onCursorChange());
      const pointer = (event: PointerEvent) => {
        const element = event.target instanceof Element ? event.target : null;
        if (!element || element.closest(REPLAY_CONTROLS_SELECTOR)) return;
        const canvas = element.closest<HTMLCanvasElement>(EDITOR_CANVAS_SELECTOR);
        if (canvas) pointerType = event.pointerType;
        if (canvas && canvas !== activeCanvas) {
          activeCanvas = canvas;
          observer.disconnect();
          observer.observe(canvas, { attributes: true, attributeFilter: ["style"] });
        }
      };
      const updateModifiers = (event: KeyboardEvent) => {
        modifiers.clear();
        if (event.ctrlKey) modifiers.add("Control");
        if (event.metaKey) modifiers.add("Meta");
        if (event.altKey) modifiers.add("Alt");
        if (event.shiftKey) modifiers.add("Shift");
      };
      const key = (event: KeyboardEvent) => {
        updateModifiers(event);
        const element = event.target instanceof Element ? event.target : null;
        if (
          !element ||
          element.closest(REPLAY_CONTROLS_SELECTOR) ||
          element.closest(PRIVATE_INPUT_SELECTOR) ||
          event.repeat ||
          event.isComposing
        )
          return;
        const keys = [...modifiers].map((name) => MODIFIER_LABELS[name]);
        if (!MODIFIER_LABELS[event.key])
          keys.push(
            event.key === " "
              ? "Space"
              : event.key === "+"
                ? "Plus"
                : event.key.length === 1
                  ? event.key.toUpperCase()
                  : event.key,
          );
        if (keys.length) onKeys(keys.join("+"));
      };
      const blur = () => modifiers.clear();
      document.addEventListener("pointerdown", pointer, true);
      document.addEventListener("pointermove", pointer, true);
      document.addEventListener("keydown", key, true);
      document.addEventListener("keyup", updateModifiers, true);
      window.addEventListener("blur", blur);
      return () => {
        observer.disconnect();
        modifiers.clear();
        activeCanvas = null;
        document.removeEventListener("pointerdown", pointer, true);
        document.removeEventListener("pointermove", pointer, true);
        document.removeEventListener("keydown", key, true);
        document.removeEventListener("keyup", updateModifiers, true);
        window.removeEventListener("blur", blur);
      };
    },
    modifiers: () => [...modifiers].map((name) => MODIFIER_LABELS[name]).join("+") || null,
    cursor(): ReplayCursorAppearance | null {
      if (!activeCanvas?.isConnected || pointerType === "touch") return null;
      const style = computedStyle(activeCanvas).cursor;
      if (style === "none") return null;
      const match = style.match(/^url\((["']?)(.*?)\1\)\s*(?:(\d+)\s+(\d+))?/);
      if (match) {
        const dimensions = cursorImage(match[2]);
        if (!dimensions) return null;
        return {
          source: match[2],
          ...dimensions,
          hotspot: { x: Number(match[3] ?? 0), y: Number(match[4] ?? 0) },
        };
      }
      const artwork = getCursorArtwork(nativeCursorRole(style));
      return {
        source: `data:image/svg+xml,${encodeURIComponent(artwork.svg)}`,
        width: artwork.width,
        height: artwork.height,
        hotspot: artwork.hotspot,
      };
    },
    pointerPlacement(canvas, pixels, pointer) {
      if (
        pointer.point.x < 0 ||
        pointer.point.y < 0 ||
        pointer.point.x >= pixels.width ||
        pointer.point.y >= pixels.height
      )
        return null;
      const size = layoutSize(canvas);
      const scale = Math.min(size.width / pixels.width, size.height / pixels.height);
      if (!(scale > 0)) return null;
      const image = clientDeltaToLocal(canvas, {
        x: pointer.cursor.width,
        y: pointer.cursor.height,
      });
      const hotspot = clientDeltaToLocal(canvas, pointer.cursor.hotspot);
      const point = {
        x: (size.width - pixels.width * scale) / 2 + pointer.point.x * scale,
        y: (size.height - pixels.height * scale) / 2 + pointer.point.y * scale,
      };
      const snapped = snapLocalToPixels(canvas, { x: point.x - hotspot.x, y: point.y - hotspot.y });
      return {
        ...pointer.cursor,
        width: image.x,
        height: image.y,
        hotspot,
        point: { x: snapped.x + hotspot.x, y: snapped.y + hotspot.y },
      };
    },
    now: () => performance.now(),
    requestFrame: (callback) => {
      const id = ++frameId;
      const request = { animation: 0, timer: 0 };
      frameRequests.set(id, request);
      const complete = () => {
        if (!frameRequests.delete(id)) return;
        cancelAnimationFrame(request.animation);
        clearTimeout(request.timer);
        callback();
      };
      request.animation = requestAnimationFrame(complete);
      // Visible embedded/occluded browser surfaces can throttle RAF to 1 Hz.
      // The painting clock must continue at the same cadence as recorded input.
      if (!document.hidden) request.timer = window.setTimeout(complete, FRAME_DEADLINE_MS);
      return id;
    },
    cancelFrame: (id) => {
      const request = frameRequests.get(id);
      if (!request) return;
      frameRequests.delete(id);
      cancelAnimationFrame(request.animation);
      clearTimeout(request.timer);
    },
    yieldTask: () => new Promise((resolve) => setTimeout(resolve, 0)),
    setTimer: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    clearTimer: (id) => window.clearTimeout(id),
    onSuspend: (callback) => {
      let timer = 0;
      const visibility = () => {
        window.clearTimeout(timer);
        if (document.hidden) timer = window.setTimeout(callback, SUSPEND_DELAY_MS);
      };
      const hide = () => {
        window.clearTimeout(timer);
        callback();
      };
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("pagehide", hide);
      return () => {
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("pagehide", hide);
      };
    },
    onResume: (callback) => {
      const visibility = () => {
        if (!document.hidden) callback();
      };
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("pageshow", callback);
      return () => {
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("pageshow", callback);
      };
    },
    pick: chooseReplay,
    download: (bytes, name, mime) =>
      downloadBlob(new Blob([new Uint8Array(bytes)], { type: mime }), name),
    paint: (canvas, pixels) => {
      let surface = surfaces.get(canvas);
      if (!surface) {
        surface = { source: document.createElement("canvas"), pixels: null };
        surfaces.set(canvas, surface);
      }
      if (surface.pixels !== pixels) {
        surface.source.width = pixels.width;
        surface.source.height = pixels.height;
        surface.source
          .getContext("2d")
          ?.putImageData(
            new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
            0,
            0,
          );
        surface.pixels = pixels;
      }
      const scale = Math.min(
        REPLAY_BACKING_SCALE,
        Math.max(1, Math.floor(Math.sqrt(MAX_BACKING_PIXELS / (pixels.width * pixels.height)))),
      );
      if (canvas.width !== pixels.width * scale || canvas.height !== pixels.height * scale) {
        canvas.width = pixels.width * scale;
        canvas.height = pixels.height * scale;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(surface.source, 0, 0, canvas.width, canvas.height);
    },
  };
}
