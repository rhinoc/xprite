import {
  clientPoint,
  clientToLocal,
  computedStyle,
  layoutSize,
  observeResize,
} from "@xprite/ui/utils";

/** Screen pixels per painted cell; the canvas draws one pixel per cell and is scaled up. */
const CELL = 16;
/** Each frame removes this much of a cell's life, so a stroke fades in about 1.6 seconds. */
const FADE_STEP = 0.01;
/** Discrete opacity steps keep the fade looking like pixel art rather than a blur. */
const OPACITY_STEPS = 4;
const RAINBOW = ["#00b854", "#ff8800", "#f52f3e", "#c832ed", "#3868ed"];
/** Cells painted with one color before the stroke moves to the next. */
const COLOR_RUN = 6;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The About hero as an editor canvas: the pointer paints pixels that fade, and the rulers
 * mark its position. Static content is never hidden or changed.
 */
export function connectLandingHero(hero: HTMLElement): () => void {
  if (window.matchMedia(REDUCED_MOTION).matches) return () => {};
  const canvas = hero.querySelector<HTMLCanvasElement>("[data-landing-paint]");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return () => {};
  const markX = hero.querySelector<HTMLElement>('[data-landing-ruler-mark="x"]');
  const markY = hero.querySelector<HTMLElement>('[data-landing-ruler-mark="y"]');
  const cells = new Map<string, { life: number; color: string }>();
  let last: readonly [number, number] | null = null;
  let stroke = 0;
  let frame = 0;

  const resize = () => {
    const size = layoutSize(hero);
    canvas.width = Math.ceil(size.width / CELL);
    canvas.height = Math.ceil(size.height / CELL);
  };
  const paint = (x: number, y: number) => {
    stroke = (stroke + 1) % (RAINBOW.length * COLOR_RUN);
    cells.set(`${x},${y}`, { life: 1, color: RAINBOW[Math.floor(stroke / COLOR_RUN)] });
  };
  /** Bresenham line, so fast strokes stay continuous. */
  const line = (from: readonly [number, number], to: readonly [number, number]) => {
    let [x, y] = from;
    const [tx, ty] = to;
    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      paint(x, y);
      if (x === tx && y === ty) return;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
  };
  const draw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const [key, cell] of cells) {
      const [x, y] = key.split(",").map(Number);
      context.globalAlpha = Math.ceil(cell.life * OPACITY_STEPS) / OPACITY_STEPS;
      context.fillStyle = cell.color;
      context.fillRect(x, y, 1, 1);
      cell.life -= FADE_STEP;
      if (cell.life <= 0) cells.delete(key);
    }
    context.globalAlpha = 1;
    frame = cells.size ? requestAnimationFrame(draw) : 0;
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const point = clientToLocal(hero, clientPoint(event));
    const cell = [Math.floor(point.x / CELL), Math.floor(point.y / CELL)] as const;
    line(last ?? cell, cell);
    last = cell;
    if (markX && markY) {
      const ruler = Number.parseFloat(computedStyle(hero).getPropertyValue("--landing-ruler")) || 0;
      markX.style.visibility = markY.style.visibility = "visible";
      markX.style.transform = `translateX(${point.x - ruler}px)`;
      markY.style.transform = `translateY(${point.y - ruler}px)`;
    }
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const leave = () => {
    last = null;
    if (markX && markY) markX.style.visibility = markY.style.visibility = "hidden";
  };

  resize();
  const stopResize = observeResize([hero], resize);
  hero.addEventListener("pointermove", move);
  hero.addEventListener("pointerleave", leave);
  return () => {
    stopResize();
    hero.removeEventListener("pointermove", move);
    hero.removeEventListener("pointerleave", leave);
    cancelAnimationFrame(frame);
  };
}
