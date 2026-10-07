import type { ShowcaseTrailMount } from "$/managers/ports/showcase";
import {
  clientPoint,
  clientPointsToLocal,
  computedStyle,
  viewportSize,
  type GeometryPoint,
} from "@xprite/ui/utils";

const CELL_SIZE = 16;
const CELL_LIFETIME_MS = 850;
const CELL_HOLD_MS = 90;
const MAX_CELLS = 240;
const MAX_SEGMENT_CELLS = 24;
const MAX_PENDING_POINTS = 32;
const MAX_OPACITY = 0.2;
const FADE_STEPS = 8;
const EDGE_STRENGTH = 0.35;
const DITHER_PERIOD = 3;
const FINE_POINTER_QUERY = "(any-hover: hover) and (any-pointer: fine)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

enum TrailPointer {
  Mouse = "mouse",
}

interface TrailCell extends GeometryPoint {
  born: number;
  strength: number;
}

/** A low-resolution pointer overlay; it only draws while a trail is alive. */
export const mountPixelTrail: ShowcaseTrailMount = (canvas, surface) => {
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const finePointer = window.matchMedia(FINE_POINTER_QUERY);
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  const cells = new Map<number, TrailCell>();
  let frame: number | undefined;
  const pending: GeometryPoint[] = [];
  let previous: GeometryPoint | undefined;
  let width = 1;
  let height = 1;
  let columns = 1;
  let rows = 1;

  const clear = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    pending.length = 0;
    previous = undefined;
    cells.clear();
    context.clearRect(0, 0, columns, rows);
  };

  const resize = () => {
    clear();
    const viewport = viewportSize();
    width = Math.max(1, viewport.width);
    height = Math.max(1, viewport.height);
    columns = Math.ceil(width / CELL_SIZE);
    rows = Math.ceil(height / CELL_SIZE);
    canvas.width = columns;
    canvas.height = rows;
    context.imageSmoothingEnabled = false;
    const style = computedStyle(surface);
    context.fillStyle = style.getPropertyValue("--ui-color-ink").trim() || style.color;
  };

  const addCell = (x: number, y: number, now: number, strength: number) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return;
    const key = y * columns + x;
    const existing = cells.get(key);
    // Revisited cells stay bright; a neighboring speck must not dim the main path.
    cells.delete(key);
    cells.set(key, { x, y, born: now, strength: Math.max(strength, existing?.strength ?? 0) });
    if (cells.size > MAX_CELLS) {
      const oldest = cells.keys().next().value;
      if (oldest !== undefined) cells.delete(oldest);
    }
  };

  const stamp = (x: number, y: number, now: number) => {
    addCell(x, y, now, 1);
    // Sparse, grid-aligned edges keep the trail pixelated rather than brush-like.
    if ((x + y) % DITHER_PERIOD === 0) addCell(x + 1, y, now, EDGE_STRENGTH);
    if ((x - y) % DITHER_PERIOD === 0) addCell(x, y - 1, now, EDGE_STRENGTH);
  };

  const draw = (now: number) => {
    frame = undefined;
    for (const point of clientPointsToLocal(canvas, pending.splice(0))) {
      const next = {
        x: Math.floor((point.x / width) * columns),
        y: Math.floor((point.y / height) * rows),
      };
      if (!previous || next.x !== previous.x || next.y !== previous.y) {
        const from = previous ?? next;
        const distance = Math.max(Math.abs(next.x - from.x), Math.abs(next.y - from.y));
        if (distance > MAX_SEGMENT_CELLS) stamp(next.x, next.y, now);
        else {
          const steps = Math.max(1, distance);
          for (let step = 1; step <= steps; step++) {
            stamp(
              Math.round(from.x + ((next.x - from.x) * step) / steps),
              Math.round(from.y + ((next.y - from.y) * step) / steps),
              now,
            );
          }
        }
      }
      previous = next;
    }

    context.clearRect(0, 0, columns, rows);
    for (const [key, cell] of cells) {
      const age = now - cell.born;
      if (age >= CELL_LIFETIME_MS) {
        cells.delete(key);
        continue;
      }
      const remaining = 1 - Math.max(0, age - CELL_HOLD_MS) / (CELL_LIFETIME_MS - CELL_HOLD_MS);
      const fade = Math.ceil(remaining * remaining * FADE_STEPS) / FADE_STEPS;
      context.globalAlpha = MAX_OPACITY * cell.strength * fade;
      context.fillRect(cell.x, cell.y, 1, 1);
    }
    if (cells.size > 0) frame = requestAnimationFrame(draw);
  };

  const move = (event: PointerEvent) => {
    if (
      event.pointerType !== TrailPointer.Mouse ||
      !event.isPrimary ||
      !finePointer.matches ||
      reducedMotion.matches ||
      document.hidden
    )
      return;
    if (pending.length === MAX_PENDING_POINTS) pending.shift();
    pending.push(clientPoint(event));
    if (frame === undefined) frame = requestAnimationFrame(draw);
  };
  const leave = () => {
    pending.length = 0;
    previous = undefined;
  };

  resize();
  surface.addEventListener("pointermove", move, { passive: true, capture: true });
  surface.addEventListener("pointerleave", leave);
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", clear, { passive: true });
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);
  finePointer.addEventListener("change", clear);
  reducedMotion.addEventListener("change", clear);
  return () => {
    clear();
    surface.removeEventListener("pointermove", move, true);
    surface.removeEventListener("pointerleave", leave);
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", clear);
    window.removeEventListener("blur", clear);
    document.removeEventListener("visibilitychange", clear);
    finePointer.removeEventListener("change", clear);
    reducedMotion.removeEventListener("change", clear);
  };
};
