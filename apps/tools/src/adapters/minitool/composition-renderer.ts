import {
  ExportContent,
  ExportFrame,
  labelSize,
  lineWidth,
  MAC_WINDOW,
  type ConsoleLayout,
  type LaptopLayout,
  type MacWindowLayout,
  type PhoneLayout,
} from "$/managers/minitool/composition";
import {
  Corner,
  labelCorners,
  placementRect,
  SplitLine,
  splitShape,
  type Point,
  type Rect,
} from "$/managers/minitool/split-geometry";
import type { MiniToolRenderer, MiniToolScene } from "$/managers/ports/minitool";
import type { PixelBuffer } from "@xprite/editor-core/base";
import iconUrl from "@xprite/site-assets/favicon-32.png?url";
import pixelBaseUrl from "@xprite/ui/fonts/fusion-pixel/fusion-12-base.woff2?url";
import pixelUrl from "@xprite/ui/fonts/fusion-pixel/fusion-12.woff2?url";
import chicagoUrl from "@xprite/ui/fonts/macintosh/chikarego2.woff2?url";
import desktopUrl from "@xprite/ui/patterns/macintosh/macos8-bumpy-blue.png?url";

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
/** Previews draw the photo from a copy at most this size; exports use the photo itself. */
const PREVIEW_SOURCE = 1600;
const DEVICE_BACKGROUND = "#E8E3DB";
const INK = "#1B1B1F";

const MAC = {
  face: "#CCCCCC",
  box: "#DDDDDD",
  light: "#FFFFFF",
  shade: "#8A8A8A",
  ink: "#000000",
};

interface Assets {
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

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, width);
  element.height = Math.max(1, height);
  return element;
}

const pictures = new WeakMap<PixelBuffer, HTMLCanvasElement>();
const previews = new WeakMap<PixelBuffer, HTMLCanvasElement>();

/** A canvas holding the buffer's pixels, made once per buffer. */
function picture(pixels: PixelBuffer): HTMLCanvasElement {
  let element = pictures.get(pixels);
  if (!element) {
    element = canvas(pixels.width, pixels.height);
    element
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    pictures.set(pixels, element);
  }
  return element;
}

/** A smoothed, smaller copy of a large photo for on-screen previews. */
function previewPicture(pixels: PixelBuffer): HTMLCanvasElement {
  const longest = Math.max(pixels.width, pixels.height);
  if (longest <= PREVIEW_SOURCE) return picture(pixels);
  let element = previews.get(pixels);
  if (!element) {
    const scale = PREVIEW_SOURCE / longest;
    element = canvas(Math.round(pixels.width * scale), Math.round(pixels.height * scale));
    const context = element.getContext("2d")!;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(picture(pixels), 0, 0, element.width, element.height);
    previews.set(pixels, element);
  }
  return element;
}

function rect(
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
function roundedPath(
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

function polygon(context: CanvasRenderingContext2D, points: readonly Point[]) {
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

function pixelFont(size: number) {
  return `${size}px ${PIXEL_FONT}, "PingFang SC", "Noto Sans CJK SC", sans-serif`;
}

/** Text shortened with an ellipsis to fit `width`. */
function fitText(context: CanvasRenderingContext2D, text: string, width: number) {
  if (context.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && context.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

// ---- The picture: original, pixelated side, divider and labels ----

function drawPicture(
  context: CanvasRenderingContext2D,
  scene: MiniToolScene,
  original: CanvasImageSource,
) {
  const { composition, split } = scene;
  const { area, placement, visible } = composition;
  const blocks = placementRect(placement);
  context.save();
  context.beginPath();
  context.rect(area.x, area.y, area.width, area.height);
  context.clip();
  rect(context, area.x, area.y, area.width, area.height, "#000");
  // The divider and labels stay on the picture, not on letterbox bars around it.
  context.beginPath();
  context.rect(visible.x, visible.y, visible.width, visible.height);
  context.clip();
  const pixels = picture(scene.pixels);
  const drawPixels = () => {
    context.imageSmoothingEnabled = false;
    context.drawImage(pixels, blocks.x, blocks.y, blocks.width, blocks.height);
  };
  if (scene.content === ExportContent.Pixels) {
    drawPixels();
    context.restore();
    return;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(original, blocks.x, blocks.y, blocks.width, blocks.height);
  const shape = splitShape(split, visible, placement);
  context.save();
  polygon(context, shape.pixels);
  context.closePath();
  context.clip();
  drawPixels();
  context.restore();
  if (split.line !== SplitLine.None) {
    const width = lineWidth(split.line, visible) * (scene.lineScale ?? 1);
    context.lineJoin = "miter";
    context.lineCap = "butt";
    polygon(context, shape.line);
    context.strokeStyle = "rgba(0,0,0,0.35)";
    context.lineWidth = width + Math.max(4, width * 0.6);
    context.stroke();
    context.strokeStyle = "#FFFFFF";
    context.lineWidth = width;
    context.stroke();
  }
  if (split.labels) drawLabels(context, scene, visible);
  context.restore();
}

function drawLabels(context: CanvasRenderingContext2D, scene: MiniToolScene, visible: Rect) {
  const corners = labelCorners(scene.split, visible);
  const size = labelSize(visible);
  const margin = Math.round(size * 0.6);
  const padX = Math.round(size * 0.42);
  const padY = Math.round(size * 0.28);
  context.font = pixelFont(size);
  context.textBaseline = "middle";
  context.textAlign = "left";
  for (const [text, corner] of [
    [scene.labels.original, corners.original],
    [scene.labels.pixels, corners.pixels],
  ] as const) {
    const width = Math.ceil(context.measureText(text).width) + 2 * padX;
    const height = size + 2 * padY;
    const left = corner === Corner.TopLeft || corner === Corner.BottomLeft;
    const top = corner === Corner.TopLeft || corner === Corner.TopRight;
    const x = left ? visible.x + margin : visible.x + visible.width - margin - width;
    const y = top ? visible.y + margin : visible.y + visible.height - margin - height;
    context.fillStyle = "rgba(18,18,22,0.62)";
    roundedPath(context, { x, y, width, height }, Math.round(size * 0.22));
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.fillText(text, x + padX, y + height / 2);
  }
}

// ---- Frames ----

function drawDesktop(context: CanvasRenderingContext2D, scene: MiniToolScene, assets: Assets) {
  const { width, height } = scene.composition.size;
  rect(context, 0, 0, width, height, "#3A5BA8");
  if (!assets.desktop) return;
  context.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y += DESKTOP_TILE)
    for (let x = 0; x < width; x += DESKTOP_TILE)
      context.drawImage(assets.desktop, x, y, DESKTOP_TILE, DESKTOP_TILE);
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

function drawMacWindow(
  context: CanvasRenderingContext2D,
  scene: MiniToolScene,
  frame: MacWindowLayout,
  assets: Assets,
) {
  const { unit: u, window: w } = frame;
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
  // Title, centred between racing stripes.
  context.font = `${12 * u}px ${CHICAGO_FONT}, ${PIXEL_FONT}, sans-serif`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  const stripesLeft = closeRight + 4 * u;
  const stripesRight = zoomLeft - 4 * u;
  // Centred on the window with room for stripes on both sides.
  const middle = (w.x + right) / 2;
  const title = fitText(
    context,
    scene.title || "Xprite",
    Math.max(0, 2 * Math.min(middle - stripesLeft, stripesRight - middle) - 24 * u),
  );
  const titleWidth = Math.ceil(context.measureText(title).width);
  const textLeft = Math.round(middle - titleWidth / 2);
  const gapLeft = textLeft - 4 * u;
  const gapRight = textLeft + titleWidth + 4 * u;
  for (let row = 0; row < MAC_WINDOW.box; row += 2) {
    const y = boxTop + row * u;
    for (const [from, to] of [
      [stripesLeft, gapLeft],
      [gapRight, stripesRight],
    ]) {
      if (to <= from) continue;
      rect(context, from, y, to - from, u, MAC.light);
      if (row + 1 < MAC_WINDOW.box) rect(context, from, y + u, to - from, u, MAC.shade);
    }
  }
  context.fillStyle = MAC.ink;
  context.fillText(title, textLeft, titleTop + titleHeight / 2 + u / 2);
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
  const iconTop = statusTopInner + Math.round((statusHeight - iconSize) / 2);
  if (assets.icon) {
    context.imageSmoothingEnabled = false;
    context.drawImage(assets.icon, w.x + 7 * u, iconTop, iconSize, iconSize);
  }
  context.font = pixelFont(PIXEL_GRID * u);
  context.fillStyle = MAC.ink;
  context.textBaseline = "middle";
  const textY = statusTopInner + statusHeight / 2 + u / 2;
  const brandLeft = w.x + 7 * u + iconSize + 3 * u;
  const dimensions = `${scene.pixels.width} × ${scene.pixels.height}`;
  const dimensionsLeft = right - 7 * u - context.measureText(dimensions).width;
  if (brandLeft + context.measureText("Xprite").width + 6 * u <= dimensionsLeft)
    context.fillText("Xprite", brandLeft, textY);
  context.textAlign = "right";
  context.fillText(dimensions, right - 7 * u, textY);
  context.textAlign = "left";
}

function drawWatermark(context: CanvasRenderingContext2D, scene: MiniToolScene, assets: Assets) {
  const mark = scene.composition.watermark;
  if (!mark) return;
  const size = Math.max(PIXEL_GRID * 2, Math.round(mark.size / PIXEL_GRID) * PIXEL_GRID);
  context.font = pixelFont(size);
  context.textBaseline = "middle";
  context.textAlign = "left";
  const gap = Math.round(size * 0.3);
  const textWidth = context.measureText("Xprite").width;
  const total = size + gap + textWidth;
  const left = Math.round(mark.x - total / 2);
  context.globalAlpha = 0.7;
  if (assets.icon) {
    context.imageSmoothingEnabled = false;
    context.drawImage(assets.icon, left, Math.round(mark.y - size / 2), size, size);
  }
  context.fillStyle = INK;
  context.fillText("Xprite", left + size + gap, mark.y + size * 0.05);
  context.globalAlpha = 1;
}

function shadowed(
  context: CanvasRenderingContext2D,
  blur: number,
  offset: number,
  draw: () => void,
) {
  context.save();
  context.shadowColor = "rgba(0,0,0,0.25)";
  context.shadowBlur = blur;
  context.shadowOffsetY = offset;
  draw();
  context.restore();
}

function drawPhone(context: CanvasRenderingContext2D, frame: PhoneLayout, under: boolean) {
  const { body, screen, scale: s } = frame;
  if (under) {
    // Side buttons, then the body with its shadow and steel ring.
    rect(context, body.x - 5 * s, body.y + 250 * s, 8 * s, 90 * s, "#2C2C30");
    rect(context, body.x - 5 * s, body.y + 360 * s, 8 * s, 90 * s, "#2C2C30");
    rect(context, body.x + body.width - 3 * s, body.y + 300 * s, 8 * s, 140 * s, "#2C2C30");
    shadowed(context, 60 * s, 30 * s, () => {
      context.fillStyle = "#1A1A1C";
      roundedPath(context, body, 112 * s);
      context.fill();
    });
    context.strokeStyle = "#3A3A3E";
    context.lineWidth = 6 * s;
    roundedPath(
      context,
      {
        x: body.x + 3 * s,
        y: body.y + 3 * s,
        width: body.width - 6 * s,
        height: body.height - 6 * s,
      },
      109 * s,
    );
    context.stroke();
    context.fillStyle = "#000";
    roundedPath(context, screen, 86 * s);
    context.fill();
    return;
  }
  // The screen's rounded corners over the picture, and the camera island.
  context.beginPath();
  context.rect(screen.x, screen.y, screen.width, screen.height);
  roundedPath(context, screen, 86 * s, false);
  context.fillStyle = "#1A1A1C";
  context.fill("evenodd");
  context.fillStyle = "#000";
  roundedPath(
    context,
    { x: body.x + body.width / 2 - 85 * s, y: screen.y + 26 * s, width: 170 * s, height: 48 * s },
    24 * s,
  );
  context.fill();
}

function drawLaptop(context: CanvasRenderingContext2D, frame: LaptopLayout, under: boolean) {
  const { lid, screen, base, scale: s } = frame;
  if (!under) return;
  shadowed(context, 50 * s, 24 * s, () => {
    context.fillStyle = "#1A1A1C";
    roundedPath(context, lid, [34 * s, 34 * s, 8 * s, 8 * s]);
    context.fill();
  });
  context.strokeStyle = "#B9BABD";
  context.lineWidth = 5 * s;
  roundedPath(
    context,
    {
      x: lid.x + 2.5 * s,
      y: lid.y + 2.5 * s,
      width: lid.width - 5 * s,
      height: lid.height - 5 * s,
    },
    [32 * s, 32 * s, 6 * s, 6 * s],
  );
  context.stroke();
  context.fillStyle = "#3A3A3E";
  context.beginPath();
  context.arc(lid.x + lid.width / 2, lid.y + 16 * s, 5 * s, 0, Math.PI * 2);
  context.fill();
  rect(context, screen.x, screen.y, screen.width, screen.height, "#0E0E10");
  shadowed(context, 40 * s, 24 * s, () => {
    const gradient = context.createLinearGradient(0, base.y, 0, base.y + base.height);
    gradient.addColorStop(0, "#D5D6D9");
    gradient.addColorStop(1, "#A9AAAE");
    context.fillStyle = gradient;
    roundedPath(context, base, [4 * s, 4 * s, 40 * s, 40 * s]);
    context.fill();
  });
  context.fillStyle = "#9C9DA1";
  roundedPath(
    context,
    { x: base.x + base.width / 2 - 90 * s, y: base.y, width: 180 * s, height: 12 * s },
    [0, 0, 8 * s, 8 * s],
  );
  context.fill();
}

function drawConsole(context: CanvasRenderingContext2D, frame: ConsoleLayout, under: boolean) {
  const { body, bezel, scale: s } = frame;
  if (!under) return;
  shadowed(context, 60 * s, 30 * s, () => {
    context.fillStyle = "#D7D4CD";
    roundedPath(context, body, [40 * s, 40 * s, 170 * s, 40 * s]);
    context.fill();
  });
  // A soft inner shade on the lower right edge.
  context.save();
  roundedPath(context, body, [40 * s, 40 * s, 170 * s, 40 * s]);
  context.clip();
  context.strokeStyle = "rgba(0,0,0,0.08)";
  context.lineWidth = 24 * s;
  roundedPath(
    context,
    { x: body.x - 12 * s, y: body.y - 12 * s, width: body.width, height: body.height },
    [40 * s, 40 * s, 170 * s, 40 * s],
  );
  context.stroke();
  context.restore();
  context.fillStyle = "#5E6371";
  roundedPath(context, bezel, [26 * s, 26 * s, 90 * s, 26 * s]);
  context.fill();
  context.fillStyle = "#E0294A";
  context.beginPath();
  context.arc(bezel.x + 30 * s, bezel.y + 250 * s, 9 * s, 0, Math.PI * 2);
  context.fill();
  context.font = pixelFont(Math.round((72 * s) / PIXEL_GRID) * PIXEL_GRID);
  context.textBaseline = "top";
  context.textAlign = "left";
  context.fillStyle = "#2D3A8C";
  context.fillText("XPRITE", body.x + 80 * s, body.y + 800 * s);
  // D-pad, A/B buttons, Select/Start and the speaker grille.
  const pad = { x: body.x + 110 * s, y: body.y + 960 * s, size: 210 * s, arm: 70 * s };
  context.fillStyle = "#26262A";
  roundedPath(
    context,
    { x: pad.x + (pad.size - pad.arm) / 2, y: pad.y, width: pad.arm, height: pad.size },
    8 * s,
  );
  context.fill();
  roundedPath(
    context,
    { x: pad.x, y: pad.y + (pad.size - pad.arm) / 2, width: pad.size, height: pad.arm },
    8 * s,
  );
  context.fill();
  for (const [x, y] of [
    [655, 1005],
    [505, 1085],
  ]) {
    for (const [dx, dy, color] of [
      [4, 7, "rgba(0,0,0,0.18)"],
      [0, 0, "#A3245A"],
    ] as const) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(body.x + (x + dx) * s, body.y + (y + dy) * s, 55 * s, 0, Math.PI * 2);
      context.fill();
    }
  }
  const pill = (x: number, y: number, width: number, height: number, color: string) => {
    context.save();
    context.translate(body.x + x * s, body.y + y * s);
    context.rotate((-25 * Math.PI) / 180);
    context.fillStyle = color;
    roundedPath(
      context,
      { x: (-width * s) / 2, y: (-height * s) / 2, width: width * s, height: height * s },
      (height * s) / 2,
    );
    context.fill();
    context.restore();
  };
  pill(340, 1234, 100, 28, "#8E8B85");
  pill(480, 1234, 100, 28, "#8E8B85");
  for (let index = 0; index < 6; index += 1)
    pill(640 + index * 26, 1190 + index * 6, 14, 110, "#BDB9B1");
}

function drawScene(
  context: CanvasRenderingContext2D,
  scene: MiniToolScene,
  assets: Assets,
  original: CanvasImageSource,
) {
  const { composition } = scene;
  const frame = composition.frame;
  const { width, height } = composition.size;
  switch (frame.kind) {
    case ExportFrame.MacOS8:
      drawDesktop(context, scene, assets);
      drawMacWindow(context, scene, frame, assets);
      break;
    case ExportFrame.None:
      break;
    default:
      rect(context, 0, 0, width, height, DEVICE_BACKGROUND);
  }
  if (frame.kind === ExportFrame.Phone) drawPhone(context, frame, true);
  if (frame.kind === ExportFrame.Laptop) drawLaptop(context, frame, true);
  if (frame.kind === ExportFrame.Console) drawConsole(context, frame, true);
  drawPicture(context, scene, original);
  if (frame.kind === ExportFrame.Phone) drawPhone(context, frame, false);
  drawWatermark(context, scene, assets);
}

/** Canvas drawing for previews and exports; one scene, any scale. */
export function createCompositionRenderer(): MiniToolRenderer & {
  render(scene: MiniToolScene): HTMLCanvasElement;
} {
  const assets: Assets = { icon: null, desktop: null };
  let loading: Promise<void> | null = null;
  const draw = (target: HTMLCanvasElement, scene: MiniToolScene, scale: number, exact: boolean) => {
    const { width, height } = scene.composition.size;
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    if (target.width !== pixelWidth) target.width = pixelWidth;
    if (target.height !== pixelHeight) target.height = pixelHeight;
    const context = target.getContext("2d");
    if (!context) throw new Error("Unable to draw the picture.");
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    drawScene(
      context,
      scene,
      assets,
      exact ? picture(scene.original) : previewPicture(scene.original),
    );
  };
  return {
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
    draw: (target, scene, scale) => draw(target, scene, scale, false),
    /** The export itself: full size, the photo at full resolution. */
    render(scene) {
      const target = canvas(scene.composition.size.width, scene.composition.size.height);
      draw(target, scene, 1, true);
      return target;
    },
  };
}
