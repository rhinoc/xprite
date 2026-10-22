/**
 * Retro frames drawn as pixel art around a picture, shared by every mini tool's previews and
 * exports. A tool draws its picture into `composition.area` after `drawFrame`.
 */
import type { Point, Rect } from "$/shared/frames/geometry";
import {
  ExportFrame,
  MAC_WINDOW,
  type Composition,
  type FrameLayout,
} from "$/shared/frames/layout";
import iconUrl from "@xprite/site-assets/favicon-32.png?url";
import pixelBaseUrl from "@xprite/ui/fonts/fusion-pixel/fusion-12-base.woff2?url";
import pixelUrl from "@xprite/ui/fonts/fusion-pixel/fusion-12.woff2?url";
import chicagoUrl from "@xprite/ui/fonts/macintosh/chikarego2.woff2?url";
import desktopUrl from "@xprite/ui/patterns/macintosh/macos8-bumpy-blue.png?url";

/** What a frame shows besides the picture: a title and a status text such as the size. */
export interface FramedPicture {
  composition: Composition;
  /** The window title or caption (see `frameShowsTitle`); empty shows "Xprite". */
  title: string;
  status: string;
}

/** The text a titled frame shows. */
function frameTitle(scene: Pick<FramedPicture, "title">): string {
  return scene.title.trim() || "Xprite";
}

/** Font families the page stylesheet and the drawings share. */
const PIXEL_FONT = "XpritePixel";
const CHICAGO_FONT = "XpriteChicago";
/** The 12px Fusion Pixel grid: whole multiples of it stay crisp. */
const PIXEL_GRID = 12;
/** Same ranges as the website's split font: the small base face, the full face only for Han. */
const BASE_RANGE =
  "U+0-2E7F, U+4E2D, U+4F53, U+6587, U+7B80, U+A000-ABFF, U+D7B0-F8FF, U+FB00-FE2F, U+FE50-FEFF, U+FFF0-1FFFF";
const HAN_RANGE =
  "U+2E80-4E2C, U+4E2E-4F52, U+4F54-6586, U+6588-7B7F, U+7B81-9FFF, U+AC00-D7AF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF, U+20000-10FFFF";
/** Mac OS 8's desktop pattern is drawn at three times its 128px tile, like the mockup. */
const DESKTOP_TILE = 384;
const DEVICE_BACKGROUND = "#E8E3DB";

const MAC = {
  face: "#CCCCCC",
  box: "#DDDDDD",
  light: "#FFFFFF",
  shade: "#8A8A8A",
  ink: "#000000",
};

export interface FrameAssets {
  icon: HTMLImageElement | null;
  desktop: HTMLImageElement | null;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function loadFont(family: string, url: string, unicodeRange?: string) {
  if (typeof FontFace !== "function") return;
  try {
    const face = new FontFace(
      family,
      `url("${url}") format("woff2")`,
      unicodeRange ? { unicodeRange } : {},
    );
    document.fonts.add(await face.load());
  } catch {
    // A missing font falls back to the system face; the drawing still works.
  }
}

/** Fonts and images the frames draw with; draw after `ready` settles for the final look. */
export function createFrameAssets(): FrameAssets & { ready(): Promise<void> } {
  let loading: Promise<void> | null = null;
  const assets: FrameAssets & { ready(): Promise<void> } = {
    icon: null,
    desktop: null,
    ready() {
      loading ??= Promise.all([
        loadFont(PIXEL_FONT, pixelBaseUrl, BASE_RANGE),
        loadFont(PIXEL_FONT, pixelUrl, HAN_RANGE),
        loadFont(CHICAGO_FONT, chicagoUrl),
        loadImage(iconUrl).then((image) => void (assets.icon = image)),
        loadImage(desktopUrl).then((image) => void (assets.desktop = image)),
      ]).then(() => undefined);
      return loading;
    },
  };
  return assets;
}

export function rect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

/** Rounded rectangle path with per-corner radii (top-left, top-right, bottom-right, bottom-left). */
export function roundedPath(
  context: CanvasRenderingContext2D,
  box: Rect,
  radii: number | [number, number, number, number],
  begin = true,
) {
  const [tl, tr, br, bl] = typeof radii === "number" ? [radii, radii, radii, radii] : radii;
  const { x, y, width, height } = box;
  if (begin) context.beginPath();
  context.moveTo(x + tl, y);
  context.lineTo(x + width - tr, y);
  context.arcTo(x + width, y, x + width, y + tr, tr);
  context.lineTo(x + width, y + height - br);
  context.arcTo(x + width, y + height, x + width - br, y + height, br);
  context.lineTo(x + bl, y + height);
  context.arcTo(x, y + height, x, y + height - bl, bl);
  context.lineTo(x, y + tl);
  context.arcTo(x, y, x + tl, y, tl);
  context.closePath();
}

export function polygon(context: CanvasRenderingContext2D, points: readonly Point[]) {
  context.beginPath();
  points.forEach((point, index) =>
    index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
  );
}

/** Two-tone bevel: light on the top and left edges, shade on the bottom and right. */
function bevel(
  context: CanvasRenderingContext2D,
  box: Rect,
  unit: number,
  light: string,
  shade: string,
) {
  rect(context, box.x, box.y, box.width - unit, unit, light);
  rect(context, box.x, box.y, unit, box.height - unit, light);
  rect(context, box.x + unit, box.y + box.height - unit, box.width - unit, unit, shade);
  rect(context, box.x + box.width - unit, box.y + unit, unit, box.height - unit, shade);
}

export function pixelFont(size: number) {
  return `${size}px ${PIXEL_FONT}, "PingFang SC", "Noto Sans CJK SC", sans-serif`;
}

/** Text shortened with an ellipsis to fit `width`. */
function fitText(context: CanvasRenderingContext2D, text: string, width: number) {
  if (context.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && context.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

// ---- Frames: pixel art at a whole number of export pixels (`u`) per art pixel ----

type Radii = [number, number, number, number];

/** How far row `row` of a stepped corner of radius `radius` (art pixels) is inset. */
function cornerInset(radius: number, row: number) {
  const y = radius - row - 0.5;
  return radius - Math.round(Math.sqrt(Math.max(0, radius * radius - y * y)));
}

/** A box with stepped, pixel-art rounded corners (radii in art pixels: tl, tr, br, bl). */
function pixelBox(
  context: CanvasRenderingContext2D,
  box: Rect,
  u: number,
  radii: number | Radii,
  color: string,
) {
  const [tl, tr, br, bl] = typeof radii === "number" ? [radii, radii, radii, radii] : radii;
  const top = Math.max(tl, tr);
  const bottom = Math.max(bl, br);
  context.fillStyle = color;
  context.fillRect(box.x, box.y + top * u, box.width, box.height - (top + bottom) * u);
  for (let row = 0; row < top; row += 1) {
    const left = row < tl ? cornerInset(tl, row) : 0;
    const right = row < tr ? cornerInset(tr, row) : 0;
    context.fillRect(box.x + left * u, box.y + row * u, box.width - (left + right) * u, u);
  }
  for (let row = 0; row < bottom; row += 1) {
    const left = row < bl ? cornerInset(bl, row) : 0;
    const right = row < br ? cornerInset(br, row) : 0;
    context.fillRect(
      box.x + left * u,
      box.y + box.height - (row + 1) * u,
      box.width - (left + right) * u,
      u,
    );
  }
}

function grow(box: Rect, by: number): Rect {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

function shifted(box: Rect, dx: number, dy: number): Rect {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

/** Pixel-font text, `scale` times its native 12px so it stays on the font's grid. */
function pixelText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  middle: number,
  scale: number,
  color: string,
  align: CanvasTextAlign = "left",
) {
  context.font = pixelFont(PIXEL_GRID * scale);
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(text, x, middle + scale / 2);
  context.textAlign = "left";
}

function drawIcon(context: CanvasRenderingContext2D, assets: FrameAssets, box: Rect) {
  if (!assets.icon) return;
  context.imageSmoothingEnabled = false;
  context.drawImage(assets.icon, box.x, box.y, box.width, box.height);
}

const FRAME_BACKGROUND: Readonly<Record<Exclude<ExportFrame, ExportFrame.None>, string>> = {
  [ExportFrame.MacOS8]: "#3A5BA8",
  [ExportFrame.System7]: "#A8A8A8",
  [ExportFrame.Windows95]: "#008080",
  [ExportFrame.OldPhone]: DEVICE_BACKGROUND,
  [ExportFrame.Handheld]: DEVICE_BACKGROUND,
  [ExportFrame.Crt]: DEVICE_BACKGROUND,
  [ExportFrame.Polaroid]: "#CDB99C",
};

function drawDesktop(context: CanvasRenderingContext2D, scene: FramedPicture, assets: FrameAssets) {
  const { width, height } = scene.composition.size;
  if (!assets.desktop) return;
  // The pattern tile at a whole multiple of its 128px art: 3× for exports, smaller for thumbnails.
  const tile = Math.max(128, Math.round((DESKTOP_TILE * width) / 1080 / 128) * 128);
  context.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y += tile)
    for (let x = 0; x < width; x += tile) context.drawImage(assets.desktop, x, y, tile, tile);
}

function macBox(context: CanvasRenderingContext2D, x: number, y: number, unit: number) {
  const size = MAC_WINDOW.box * unit;
  rect(context, x, y, size, size, MAC.ink);
  rect(context, x + unit, y + unit, size - 2 * unit, size - 2 * unit, MAC.box);
  bevel(
    context,
    { x: x + unit, y: y + unit, width: size - 2 * unit, height: size - 2 * unit },
    unit,
    MAC.light,
    MAC.shade,
  );
  return size;
}

/** Racing stripes or rule lines around a centred title, leaving a gap for the text. */
function titleWithStripes(
  context: CanvasRenderingContext2D,
  options: {
    title: string;
    left: number;
    right: number;
    middle: number;
    top: number;
    rows: number;
    u: number;
    stripe: (from: number, to: number, y: number, row: number) => void;
    textMiddle: number;
    color: string;
  },
) {
  const { left, right, middle, u } = options;
  context.font = `${12 * u}px ${CHICAGO_FONT}, ${PIXEL_FONT}, sans-serif`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  // Centred on the window with room for stripes on both sides.
  const title = fitText(
    context,
    options.title,
    Math.max(0, 2 * Math.min(middle - left, right - middle) - 24 * u),
  );
  const titleWidth = Math.ceil(context.measureText(title).width);
  const textLeft = Math.round(middle - titleWidth / 2);
  for (let row = 0; row < options.rows; row += 2)
    for (const [from, to] of [
      [left, textLeft - 4 * u],
      [textLeft + titleWidth + 4 * u, right],
    ])
      if (to > from) options.stripe(from, to, options.top + row * u, row);
  context.fillStyle = options.color;
  context.fillText(title, textLeft, options.textMiddle);
}

function drawMacWindow(
  context: CanvasRenderingContext2D,
  scene: FramedPicture,
  frame: FrameLayout,
  assets: FrameAssets,
) {
  const { unit: u, body: w } = frame;
  const { area } = scene.composition;
  const right = w.x + w.width;
  const bottom = w.y + w.height;
  // Drop shadow, black outline and the platinum face.
  rect(context, w.x + 2 * u, w.y + 2 * u, w.width, w.height, "rgba(0,0,0,0.35)");
  rect(context, w.x, w.y, w.width, w.height, MAC.ink);
  rect(context, w.x + u, w.y + u, w.width - 2 * u, w.height - 2 * u, MAC.face);
  // Title bar.
  const titleTop = w.y + u;
  const titleHeight = MAC_WINDOW.title * u;
  bevel(
    context,
    { x: w.x + u, y: titleTop, width: w.width - 2 * u, height: titleHeight },
    u,
    MAC.light,
    MAC.shade,
  );
  rect(context, w.x + u, titleTop + titleHeight, w.width - 2 * u, u, MAC.ink);
  const boxTop = titleTop + 4 * u;
  const closeLeft = w.x + u + 6 * u;
  const closeRight = closeLeft + macBox(context, closeLeft, boxTop, u);
  const collapseLeft = right - u - 6 * u - MAC_WINDOW.box * u;
  macBox(context, collapseLeft, boxTop, u);
  // Collapse box: the window-shade bar.
  rect(context, collapseLeft + 2 * u, boxTop + 5 * u, MAC_WINDOW.box * u - 4 * u, u, MAC.ink);
  const zoomLeft = collapseLeft - 3 * u - MAC_WINDOW.box * u;
  macBox(context, zoomLeft, boxTop, u);
  // Zoom box: a small window in the corner.
  const small = 5 * u;
  rect(context, zoomLeft + 2 * u, boxTop + 2 * u, small, small, MAC.ink);
  rect(context, zoomLeft + 3 * u, boxTop + 3 * u, small - 2 * u, small - 2 * u, MAC.box);
  titleWithStripes(context, {
    title: frameTitle(scene),
    left: closeRight + 4 * u,
    right: zoomLeft - 4 * u,
    middle: (w.x + right) / 2,
    top: boxTop,
    rows: MAC_WINDOW.box,
    u,
    stripe: (from, to, y, row) => {
      rect(context, from, y, to - from, u, MAC.light);
      if (row + 1 < MAC_WINDOW.box) rect(context, from, y + u, to - from, u, MAC.shade);
    },
    textMiddle: titleTop + titleHeight / 2 + u / 2,
    color: MAC.ink,
  });
  // Content panel and the sunken frame around the picture.
  const bodyTop = titleTop + titleHeight + u;
  const statusTop = bottom - u - MAC_WINDOW.status * u - u;
  bevel(
    context,
    { x: w.x + u, y: bodyTop, width: w.width - 2 * u, height: statusTop - bodyTop },
    u,
    MAC.light,
    MAC.shade,
  );
  rect(context, area.x - 2 * u, area.y - 2 * u, area.width + 4 * u, area.height + 4 * u, MAC.light);
  rect(context, area.x - 2 * u, area.y - 2 * u, area.width + 3 * u, area.height + 3 * u, MAC.shade);
  rect(context, area.x - u, area.y - u, area.width + 2 * u, area.height + 2 * u, MAC.ink);
  // Status bar: the Xprite mark and the block count.
  rect(context, w.x + u, statusTop, w.width - 2 * u, u, MAC.ink);
  const statusTopInner = statusTop + u;
  const statusHeight = MAC_WINDOW.status * u;
  rect(context, w.x + u, statusTopInner, w.width - 2 * u, u, MAC.light);
  rect(context, w.x + u, statusTopInner, u, statusHeight, MAC.light);
  const iconSize = 10 * u;
  drawIcon(context, assets, {
    x: w.x + 7 * u,
    y: statusTopInner + Math.round((statusHeight - iconSize) / 2),
    width: iconSize,
    height: iconSize,
  });
  statusTexts(context, scene, {
    left: w.x + 7 * u + iconSize + 3 * u,
    right: right - 7 * u,
    middle: statusTopInner + statusHeight / 2,
    u,
    color: MAC.ink,
  });
}

/** "Xprite" on the left and the block count on the right; the mark gives way when tight. */
function statusTexts(
  context: CanvasRenderingContext2D,
  scene: FramedPicture,
  {
    left,
    right,
    middle,
    u,
    color,
  }: { left: number; right: number; middle: number; u: number; color: string },
) {
  context.font = pixelFont(PIXEL_GRID * u);
  const dimensions = scene.status;
  const dimensionsLeft = right - context.measureText(dimensions).width;
  if (left + context.measureText("Xprite").width + 6 * u <= dimensionsLeft)
    pixelText(context, "Xprite", left, middle, u, color);
  pixelText(context, dimensions, right, middle, u, color, "right");
}

function drawSystem7(context: CanvasRenderingContext2D, scene: FramedPicture, frame: FrameLayout) {
  const { unit: u, body: w } = frame;
  const right = w.x + w.width;
  // The one-pixel drop shadow, black outline and white face.
  rect(context, w.x + u, w.y + u, w.width, w.height, "#000");
  rect(context, w.x, w.y, w.width, w.height, "#000");
  rect(context, w.x + u, w.y + u, w.width - 2 * u, w.height - 2 * u, "#FFF");
  // Title bar: six rule lines, the close and zoom boxes, the title in a white gap.
  const titleTop = w.y + u;
  const box = 11 * u;
  const boxTop = titleTop + 4 * u;
  const closeLeft = w.x + 9 * u;
  const zoomLeft = right - 9 * u - box;
  const stripe = (from: number, to: number, y: number) =>
    rect(context, from, y, to - from, u, "#000");
  for (let row = 0; row < 11; row += 2) {
    stripe(w.x + 2 * u, closeLeft - u, boxTop + row * u);
    stripe(zoomLeft + box + u, right - 2 * u, boxTop + row * u);
  }
  titleWithStripes(context, {
    title: frameTitle(scene),
    left: closeLeft + box + u,
    right: zoomLeft - u,
    middle: (w.x + right) / 2,
    top: boxTop,
    rows: 11,
    u,
    stripe,
    textMiddle: titleTop + 9 * u + u / 2,
    color: "#000",
  });
  for (const left of [closeLeft, zoomLeft]) {
    rect(context, left - u, boxTop - u, box + 2 * u, box + 2 * u, "#FFF");
    rect(context, left, boxTop, box, box, "#000");
    rect(context, left + u, boxTop + u, box - 2 * u, box - 2 * u, "#FFF");
  }
  rect(context, zoomLeft, boxTop, 6 * u, 6 * u, "#000");
  rect(context, zoomLeft + u, boxTop + u, 4 * u, 4 * u, "#FFF");
  // Info bar between two rules: the Xprite mark and the block count.
  rect(context, w.x, w.y + 19 * u, w.width, u, "#000");
  statusTexts(context, scene, {
    left: w.x + 6 * u,
    right: right - 6 * u,
    middle: w.y + 20 * u + 7.5 * u,
    u,
    color: "#000",
  });
  rect(context, w.x, w.y + 35 * u, w.width, u, "#000");
}

const WIN = {
  face: "#C0C0C0",
  light: "#DFDFDF",
  white: "#FFFFFF",
  shade: "#808080",
  dark: "#000000",
  title: "#000080",
};

/** Windows-style two-pixel bevel: raised (light top-left) or sunken (dark top-left). */
function winBevel(context: CanvasRenderingContext2D, box: Rect, u: number, raised: boolean) {
  const outer = raised ? [WIN.light, WIN.dark] : [WIN.shade, WIN.white];
  const inner = raised ? [WIN.white, WIN.shade] : [WIN.dark, WIN.light];
  for (const [inset, [topLeft, bottomRight]] of [
    [0, outer],
    [1, inner],
  ] as const) {
    const b = grow(box, -inset * u);
    rect(context, b.x, b.y, b.width, u, topLeft);
    rect(context, b.x, b.y, u, b.height, topLeft);
    rect(context, b.x, b.y + b.height - u, b.width, u, bottomRight);
    rect(context, b.x + b.width - u, b.y, u, b.height, bottomRight);
  }
}

function drawWindows95(
  context: CanvasRenderingContext2D,
  scene: FramedPicture,
  frame: FrameLayout,
  assets: FrameAssets,
) {
  const { unit: u, body: w } = frame;
  const { area } = scene.composition;
  const right = w.x + w.width;
  rect(context, w.x + 2 * u, w.y + 2 * u, w.width, w.height, "rgba(0,0,0,0.3)");
  rect(context, w.x, w.y, w.width, w.height, WIN.face);
  winBevel(context, w, u, true);
  // Title bar with the Xprite icon, the title and three caption buttons.
  const bar = { x: w.x + 3 * u, y: w.y + 3 * u, width: w.width - 6 * u, height: 18 * u };
  rect(context, bar.x, bar.y, bar.width, bar.height, WIN.title);
  drawIcon(context, assets, { x: bar.x + 2 * u, y: bar.y + u, width: 16 * u, height: 16 * u });
  const button = { width: 16 * u, height: 14 * u };
  const closeLeft = bar.x + bar.width - 2 * u - button.width;
  const maximizeLeft = closeLeft - 2 * u - button.width;
  const minimizeLeft = maximizeLeft - button.width;
  context.font = pixelFont(PIXEL_GRID * u);
  const title = fitText(context, frameTitle(scene), minimizeLeft - bar.x - 26 * u);
  pixelText(context, title, bar.x + 21 * u, bar.y + bar.height / 2, u, WIN.white);
  for (const left of [minimizeLeft, maximizeLeft, closeLeft]) {
    const box = { x: left, y: bar.y + 2 * u, ...button };
    rect(context, box.x, box.y, box.width, box.height, WIN.face);
    winBevel(context, box, u, true);
  }
  const glyphTop = bar.y + 5 * u;
  rect(context, minimizeLeft + 4 * u, glyphTop + 6 * u, 6 * u, 2 * u, WIN.dark);
  rect(context, maximizeLeft + 3 * u, glyphTop - u, 9 * u, 9 * u, WIN.dark);
  rect(context, maximizeLeft + 4 * u, glyphTop + u, 7 * u, 6 * u, WIN.face);
  for (let step = 0; step < 7; step += 1) {
    rect(context, closeLeft + (4 + step) * u, glyphTop - u + step * u, 2 * u, u, WIN.dark);
    rect(context, closeLeft + (10 - step) * u, glyphTop - u + step * u, 2 * u, u, WIN.dark);
  }
  // The sunken picture well and the status bar's two panes.
  winBevel(context, grow(area, 2 * u), u, false);
  const statusTop = area.y + area.height + 4 * u;
  const split = Math.round((w.width - 6 * u) * 0.6);
  const panes = [
    { x: w.x + 3 * u, y: statusTop, width: split - u, height: 18 * u },
    {
      x: w.x + 3 * u + split + u,
      y: statusTop,
      width: w.width - 6 * u - split - u,
      height: 18 * u,
    },
  ];
  for (const pane of panes) {
    rect(context, pane.x, pane.y, pane.width, u, WIN.shade);
    rect(context, pane.x, pane.y, u, pane.height, WIN.shade);
    rect(context, pane.x, pane.y + pane.height - u, pane.width, u, WIN.white);
    rect(context, pane.x + pane.width - u, pane.y, u, pane.height, WIN.white);
  }
  const middle = statusTop + 9 * u;
  pixelText(context, "Xprite", panes[0].x + 4 * u, middle, u, WIN.dark);
  context.font = pixelFont(PIXEL_GRID * u);
  if (context.measureText(scene.status).width <= panes[1].width - 6 * u)
    pixelText(context, scene.status, right - 7 * u, middle, u, WIN.dark, "right");
}

const PHONE = {
  body: "#34404F",
  edge: "#4B596C",
  bezel: "#1A2129",
  lcd: "#A3BE6E",
  key: "#D5DAE0",
  keyShade: "#97A1AD",
  brand: "#C3CCD6",
};

function drawOldPhone(context: CanvasRenderingContext2D, scene: FramedPicture, frame: FrameLayout) {
  const { unit: u, body: b } = frame;
  const { area } = scene.composition;
  const radii: Radii = [10, 10, 14, 14];
  pixelBox(context, shifted(b, 3 * u, 3 * u), u, radii, "rgba(0,0,0,0.18)");
  pixelBox(context, b, u, radii, PHONE.body);
  rect(context, b.x + 2 * u, b.y + 12 * u, u, b.height - 28 * u, PHONE.edge);
  const middle = b.x + b.width / 2;
  // Earpiece slot and the brand.
  pixelBox(
    context,
    { x: middle - 9 * u, y: b.y + 5 * u, width: 18 * u, height: 3 * u },
    u,
    1,
    PHONE.bezel,
  );
  pixelText(context, "XPRITE", middle, b.y + 16 * u, u, PHONE.brand, "center");
  // Screen: dark bezel, then the green-lit glass edge around the picture.
  pixelBox(context, grow(area, 6 * u), u, 3, PHONE.bezel);
  rect(context, area.x - 3 * u, area.y - 3 * u, area.width + 6 * u, area.height + 6 * u, PHONE.lcd);
  // Navigation key with the two soft keys, then the keypad.
  const columns = Math.max(10, Math.floor((b.width / u - 26 - 8) / 3));
  const keypad = (3 * columns + 8) * u;
  const left = Math.round(middle - keypad / 2);
  let y = area.y + area.height + 12 * u;
  const key = (x: number, top: number, width: number, height: number) => {
    pixelBox(context, { x, y: top + u, width, height }, u, 2, PHONE.keyShade);
    pixelBox(context, { x, y: top, width, height }, u, 2, PHONE.key);
  };
  const nav = { width: Math.round(keypad * 0.42), height: 10 * u };
  key(Math.round(middle - nav.width / 2), y, nav.width, nav.height);
  const soft = columns * u;
  key(left, y + 2 * u, soft, 7 * u);
  key(left + keypad - soft, y + 2 * u, soft, 7 * u);
  rect(context, left + 3 * u, y + 5 * u, soft - 6 * u, u, "#3E9A54");
  rect(context, left + keypad - soft + 3 * u, y + 5 * u, soft - 6 * u, u, "#C2463F");
  y += nav.height + 6 * u;
  for (let row = 0; row < 4; row += 1)
    for (let column = 0; column < 3; column += 1)
      key(left + column * (columns + 4) * u, y + row * 10 * u, columns * u, 7 * u);
  rect(context, middle - u, b.y + b.height - 7 * u, 2 * u, u, PHONE.bezel);
}

const HANDHELD = {
  body: "#C9C5BE",
  shade: "#ADA9A1",
  bezel: "#5D6077",
  led: "#D1324C",
  brand: "#2E3B8E",
  pad: "#2A2A2E",
  button: "#9C2A5B",
  pill: "#8E8A84",
};

function drawHandheld(context: CanvasRenderingContext2D, scene: FramedPicture, frame: FrameLayout) {
  const { unit: u, body: b } = frame;
  const { area } = scene.composition;
  const radii: Radii = [4, 4, 22, 4];
  pixelBox(context, shifted(b, 3 * u, 3 * u), u, radii, "rgba(0,0,0,0.18)");
  pixelBox(context, b, u, radii, HANDHELD.body);
  rect(context, b.x + 3 * u, b.y + 3 * u, b.width - 6 * u, u, HANDHELD.shade);
  // Bezel with the power light; the picture sits in a thin dark rim.
  const bezel = {
    x: area.x - 10 * u,
    y: area.y - 8 * u,
    width: area.width + 20 * u,
    height: area.height + 22 * u,
  };
  pixelBox(context, bezel, u, [3, 3, 12, 3], HANDHELD.bezel);
  rect(context, area.x - u, area.y - u, area.width + 2 * u, area.height + 2 * u, "#202230");
  pixelBox(
    context,
    { x: bezel.x + 3 * u, y: area.y + Math.round(area.height / 3), width: 4 * u, height: 4 * u },
    u,
    1,
    HANDHELD.led,
  );
  const below = bezel.y + bezel.height;
  pixelText(context, "XPRITE", bezel.x + u, below + 11 * u, u, HANDHELD.brand);
  // D-pad, A and B, select and start, and the speaker grille.
  const controls = below + 24 * u;
  const pad = { x: b.x + 12 * u, y: controls, arm: 7 * u };
  rect(context, pad.x + pad.arm, pad.y, pad.arm, 3 * pad.arm, HANDHELD.pad);
  rect(context, pad.x, pad.y + pad.arm, 3 * pad.arm, pad.arm, HANDHELD.pad);
  const right = b.x + b.width;
  for (const [x, y] of [
    [right - 28 * u, controls + 9 * u],
    [right - 14 * u, controls + 3 * u],
  ])
    pixelBox(
      context,
      { x: x - 6 * u, y: y - 6 * u, width: 12 * u, height: 12 * u },
      u,
      6,
      HANDHELD.button,
    );
  const middle = b.x + b.width / 2;
  for (const offset of [-15, 3])
    pixelBox(
      context,
      { x: middle + offset * u, y: controls + 34 * u, width: 12 * u, height: 4 * u },
      u,
      2,
      HANDHELD.pill,
    );
  for (let line = 0; line < 5; line += 1)
    for (let step = 0; step < 9; step += 1)
      rect(
        context,
        right - (26 - line * 4 - step) * u,
        b.y + b.height - (6 + step) * u,
        2 * u,
        u,
        HANDHELD.shade,
      );
}

const CRT = {
  case: "#D8D1BD",
  light: "#EEE9DA",
  shade: "#B3AB94",
  dark: "#8C846F",
  glass: "#121416",
  led: "#3FCF5A",
};

function drawCrt(
  context: CanvasRenderingContext2D,
  scene: FramedPicture,
  frame: FrameLayout,
  assets: FrameAssets,
) {
  const { unit: u, body: b } = frame;
  const { area } = scene.composition;
  const shell = { x: b.x, y: b.y, width: b.width, height: b.height - 12 * u };
  const middle = b.x + b.width / 2;
  // Stand: neck and foot, behind the case.
  const neck = Math.round((b.width * 0.36) / u) * u;
  const foot = Math.round((b.width * 0.62) / u) * u;
  pixelBox(
    context,
    shifted(
      { x: middle - foot / 2, y: b.y + b.height - 7 * u, width: foot, height: 7 * u },
      3 * u,
      3 * u,
    ),
    u,
    [2, 2, 1, 1],
    "rgba(0,0,0,0.18)",
  );
  rect(context, middle - neck / 2, shell.y + shell.height, neck, 5 * u, CRT.dark);
  pixelBox(
    context,
    { x: middle - foot / 2, y: b.y + b.height - 7 * u, width: foot, height: 7 * u },
    u,
    [2, 2, 1, 1],
    CRT.shade,
  );
  rect(context, middle - foot / 2 + 2 * u, b.y + b.height - 7 * u, foot - 4 * u, u, CRT.light);
  // Case with a highlight on the top and left, shade on the bottom and right.
  pixelBox(context, shifted(shell, 3 * u, 3 * u), u, 4, "rgba(0,0,0,0.18)");
  pixelBox(context, shell, u, 4, CRT.dark);
  pixelBox(context, grow(shell, -u), u, 3, CRT.case);
  rect(context, shell.x + 4 * u, shell.y + u, shell.width - 8 * u, u, CRT.light);
  rect(context, shell.x + u, shell.y + 4 * u, u, shell.height - 8 * u, CRT.light);
  rect(context, shell.x + 4 * u, shell.y + shell.height - 2 * u, shell.width - 8 * u, u, CRT.shade);
  // Recessed screen surround and the glass with rounded corners.
  const recess = grow(area, 8 * u);
  rect(context, recess.x, recess.y, recess.width, recess.height, CRT.shade);
  rect(context, recess.x, recess.y, recess.width, u, CRT.dark);
  rect(context, recess.x, recess.y, u, recess.height, CRT.dark);
  rect(context, recess.x, recess.y + recess.height - u, recess.width, u, CRT.light);
  rect(context, recess.x + recess.width - u, recess.y, u, recess.height, CRT.light);
  const glass = grow(area, 4 * u);
  pixelBox(context, glass, u, 3, CRT.glass);
  rect(context, glass.x + 3 * u, glass.y + u, 6 * u, u, "#3A3E44");
  rect(context, glass.x + u, glass.y + 3 * u, u, 4 * u, "#3A3E44");
  // Front panel: the Xprite badge, power light and two buttons.
  const panel = recess.y + recess.height + 10 * u;
  drawIcon(context, assets, { x: recess.x + u, y: panel - 4 * u, width: 8 * u, height: 8 * u });
  pixelText(context, "Xprite", recess.x + 12 * u, panel, u, CRT.dark);
  const right = recess.x + recess.width;
  rect(context, right - 3 * u, panel - u, 2 * u, 2 * u, CRT.led);
  for (const offset of [10, 19]) {
    rect(context, right - offset * u, panel - 2 * u, 6 * u, 4 * u, CRT.dark);
    rect(context, right - offset * u, panel - 2 * u, 6 * u, 3 * u, CRT.shade);
  }
}

function drawPolaroid(context: CanvasRenderingContext2D, scene: FramedPicture, frame: FrameLayout) {
  const { unit: u, body: b } = frame;
  const { area } = scene.composition;
  rect(context, b.x + 3 * u, b.y + 3 * u, b.width, b.height, "rgba(0,0,0,0.2)");
  rect(context, b.x, b.y, b.width, b.height, "#F6F3EC");
  rect(context, b.x, b.y + b.height - u, b.width, u, "#E1DBCF");
  rect(context, area.x - u, area.y - u, area.width + 2 * u, area.height + 2 * u, "#DCD6CA");
  // The title as a caption in the wide bottom strip.
  const scale = Math.max(1, Math.round(u * 0.6));
  context.font = pixelFont(PIXEL_GRID * scale);
  pixelText(
    context,
    fitText(context, frameTitle(scene), area.width - 4 * u),
    b.x + b.width / 2,
    area.y + area.height + Math.round((b.y + b.height - area.y - area.height) / 2 / u) * u,
    scale,
    "#6B655C",
    "center",
  );
}

/** The frame's background and art around `scene.composition.area`; nothing when frameless. */
export function drawFrame(
  context: CanvasRenderingContext2D,
  scene: FramedPicture,
  assets: FrameAssets,
) {
  const { composition } = scene;
  const frame = composition.frame;
  if (frame.kind !== ExportFrame.None) {
    const { width, height } = composition.size;
    rect(context, 0, 0, width, height, FRAME_BACKGROUND[frame.kind]);
  }
  switch (frame.kind) {
    case ExportFrame.MacOS8:
      drawDesktop(context, scene, assets);
      drawMacWindow(context, scene, frame, assets);
      break;
    case ExportFrame.System7:
      drawSystem7(context, scene, frame);
      break;
    case ExportFrame.Windows95:
      drawWindows95(context, scene, frame, assets);
      break;
    case ExportFrame.OldPhone:
      drawOldPhone(context, scene, frame);
      break;
    case ExportFrame.Handheld:
      drawHandheld(context, scene, frame);
      break;
    case ExportFrame.Crt:
      drawCrt(context, scene, frame, assets);
      break;
    case ExportFrame.Polaroid:
      drawPolaroid(context, scene, frame);
      break;
    default:
  }
}
