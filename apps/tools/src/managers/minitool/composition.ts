import {
  intersectRects,
  placementRect,
  type Placement,
  type Rect,
} from "$/managers/minitool/split-geometry";
import type { PixelBuffer } from "@xprite/editor-core/base";

/** Every export is this wide; heights follow the ratio. */
const EXPORT_WIDTH = 1080;

export enum ExportRatio {
  Portrait = "3:4",
  Square = "1:1",
  Story = "9:16",
}

export enum ExportFrame {
  None = "none",
  MacOS8 = "mac-os-8",
  System7 = "system-7",
  Windows95 = "windows-95",
  OldPhone = "old-phone",
  Handheld = "handheld",
  Crt = "crt",
  Polaroid = "polaroid",
}

/** What the export shows: the before/after split, or only the pixelated picture. */
export enum ExportContent {
  Split = "split",
  Pixels = "pixels",
}

export interface LayoutState {
  ratio: ExportRatio;
  frame: ExportFrame;
}

export const DEFAULT_LAYOUT: Readonly<LayoutState> = {
  ratio: ExportRatio.Portrait,
  frame: ExportFrame.None,
};

export const EXPORT_RATIOS = [ExportRatio.Portrait, ExportRatio.Square, ExportRatio.Story] as const;
export const EXPORT_FRAMES = [
  ExportFrame.None,
  ExportFrame.MacOS8,
  ExportFrame.System7,
  ExportFrame.Windows95,
  ExportFrame.OldPhone,
  ExportFrame.Handheld,
  ExportFrame.Crt,
  ExportFrame.Polaroid,
] as const;

const RATIO_HEIGHTS: Readonly<Record<ExportRatio, number>> = {
  [ExportRatio.Portrait]: 1440,
  [ExportRatio.Square]: 1080,
  [ExportRatio.Story]: 1920,
};

export interface CanvasSize {
  width: number;
  height: number;
}

export function exportSize(ratio: ExportRatio): CanvasSize {
  return { width: EXPORT_WIDTH, height: RATIO_HEIGHTS[ratio] };
}

/** A frameless export fills the canvas with whole-pixel blocks, cropping the overflow. */
function coverBlocks(area: Rect, grid: CanvasSize): Placement {
  const columns = Math.max(1, grid.width);
  const rows = Math.max(1, grid.height);
  const cell = Math.ceil(Math.max(area.width / columns, area.height / rows));
  return {
    x: area.x + Math.round((area.width - columns * cell) / 2),
    y: area.y + Math.round((area.height - rows * cell) / 2),
    cell,
    columns,
    rows,
  };
}

/** Frame art pixels between the frame's outer edge and the picture, in frame units. */
interface FrameChrome {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Mac OS 8 window parts, in window pixels (`unit` export units each). */
export const MAC_WINDOW = {
  border: 1,
  title: 19,
  padding: 6,
  inset: 1,
  status: 16,
  box: 11,
} as const;

/**
 * Every frame is pixel art drawn at a whole number of export pixels per art pixel (`unit`), sized
 * around the picture so the picture itself keeps whole-pixel blocks with no letterboxing.
 */
const FRAME_CHROME: Readonly<Record<Exclude<ExportFrame, ExportFrame.None>, FrameChrome>> = {
  [ExportFrame.MacOS8]: {
    left: MAC_WINDOW.border + MAC_WINDOW.padding + MAC_WINDOW.inset,
    right: MAC_WINDOW.border + MAC_WINDOW.padding + MAC_WINDOW.inset,
    top: MAC_WINDOW.border + MAC_WINDOW.title + 1 + MAC_WINDOW.padding + MAC_WINDOW.inset,
    bottom: MAC_WINDOW.inset + MAC_WINDOW.padding + 1 + MAC_WINDOW.status + MAC_WINDOW.border,
  },
  // Outline, striped title bar, an info bar, the picture flush with the window frame.
  [ExportFrame.System7]: { left: 1, right: 1, top: 36, bottom: 1 },
  // Raised frame, title bar, sunken picture well and a status bar.
  [ExportFrame.Windows95]: { left: 6, right: 6, top: 26, bottom: 26 },
  // Earpiece and brand above the screen, navigation key and keypad below.
  [ExportFrame.OldPhone]: { left: 13, right: 13, top: 30, bottom: 78 },
  // Bezel with a power light, the brand and the buttons below.
  [ExportFrame.Handheld]: { left: 18, right: 18, top: 18, bottom: 84 },
  // Beige case, glass with rounded corners, front panel and stand.
  [ExportFrame.Crt]: { left: 18, right: 18, top: 18, bottom: 40 },
  // An instant photo: thin sides, a wide caption strip.
  [ExportFrame.Polaroid]: { left: 9, right: 9, top: 9, bottom: 34 },
};

/** Space around a frame at the 1080 × 1440 design size, in export pixels. */
const FRAME_MARGIN: Readonly<Record<Exclude<ExportFrame, ExportFrame.None>, CanvasSize>> = {
  [ExportFrame.MacOS8]: { width: 130, height: 120 },
  [ExportFrame.System7]: { width: 110, height: 110 },
  [ExportFrame.Windows95]: { width: 100, height: 110 },
  [ExportFrame.OldPhone]: { width: 120, height: 70 },
  [ExportFrame.Handheld]: { width: 110, height: 70 },
  [ExportFrame.Crt]: { width: 70, height: 110 },
  [ExportFrame.Polaroid]: { width: 120, height: 130 },
};
/** Export pixels per frame art pixel at the design size. */
const FRAME_UNIT = 5;

export interface FrameLayout {
  kind: Exclude<ExportFrame, ExportFrame.None>;
  /** Export pixels per frame art pixel. */
  unit: number;
  /** The frame's outer box. */
  body: Rect;
}
interface PlainLayout {
  kind: ExportFrame.None;
}

export interface Composition {
  size: CanvasSize;
  frame: FrameLayout | PlainLayout;
  /** Where the picture shows (clip to it). */
  area: Rect;
  /** The picture's blocks; may extend past `area` when cropped. */
  placement: Placement;
  /** The visible part of the picture: the split and labels live here. */
  visible: Rect;
  /** Whether the frame fits the canvas with at least one export pixel per block. */
  fits: boolean;
}

/** Design sizes at 1080 × 1440; other sizes scale them to fit. */
const DESIGN = { width: 1080, height: 1440 };

function designScale(size: CanvasSize) {
  return Math.min(size.width / DESIGN.width, size.height / DESIGN.height);
}

/**
 * Lay out one export: frame parts and where the picture's blocks go. `size` defaults to the
 * ratio's export size; frame thumbnails pass their own device-pixel size.
 */
export function composeLayout(
  layout: LayoutState,
  grid: CanvasSize,
  size: CanvasSize = exportSize(layout.ratio),
): Composition {
  const columns = Math.max(1, grid.width);
  const rows = Math.max(1, grid.height);
  if (layout.frame === ExportFrame.None) {
    const area = { x: 0, y: 0, ...size };
    const placement = coverBlocks(area, { width: columns, height: rows });
    return {
      size,
      frame: { kind: ExportFrame.None },
      area,
      placement,
      visible: intersectRects(area, placementRect(placement)),
      fits: true,
    };
  }
  const kind = layout.frame;
  const scale = designScale(size);
  const unit = Math.max(1, Math.round(FRAME_UNIT * scale));
  const chrome = FRAME_CHROME[kind];
  const margin = FRAME_MARGIN[kind];
  const chromeWidth = (chrome.left + chrome.right) * unit;
  const chromeHeight = (chrome.top + chrome.bottom) * unit;
  const room = {
    width: size.width - 2 * Math.round(margin.width * scale) - chromeWidth,
    height: size.height - 2 * Math.round(margin.height * scale) - chromeHeight,
  };
  const fitted = Math.floor(Math.min(room.width / columns, room.height / rows));
  const cell = Math.max(1, fitted);
  const width = columns * cell + chromeWidth;
  const height = rows * cell + chromeHeight;
  const body = {
    x: Math.round((size.width - width) / 2),
    y: Math.round((size.height - height) / 2),
    width,
    height,
  };
  const area = {
    x: body.x + chrome.left * unit,
    y: body.y + chrome.top * unit,
    width: columns * cell,
    height: rows * cell,
  };
  return {
    size,
    frame: { kind, unit, body },
    area,
    placement: { x: area.x, y: area.y, cell, columns, rows },
    visible: area,
    fits: fitted >= 1 && body.x >= 0 && body.y >= 0,
  };
}

/**
 * A frame thumbnail at `size` device pixels: the frame at one device pixel per art pixel, and the
 * picture sampled down by a whole factor until it fits with at least one pixel per block.
 */
export function frameThumbnail(
  layout: LayoutState,
  grid: CanvasSize,
  size: CanvasSize,
): { composition: Composition; factor: number } {
  for (let factor = 1; ; factor += 1) {
    const sampled = {
      width: Math.max(1, Math.ceil(grid.width / factor)),
      height: Math.max(1, Math.ceil(grid.height / factor)),
    };
    const composition = composeLayout(layout, sampled, size);
    if (composition.fits || (sampled.width === 1 && sampled.height === 1))
      return { composition, factor };
  }
}

/** Every `factor`-th pixel of a buffer, for thumbnails. */
export function samplePixels(pixels: PixelBuffer, factor: number): PixelBuffer {
  if (factor <= 1) return pixels;
  const width = Math.max(1, Math.ceil(pixels.width / factor));
  const height = Math.max(1, Math.ceil(pixels.height / factor));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const from = (y * factor * pixels.width + x * factor) * 4;
      data.set(pixels.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  return { width, height, data };
}

/** Label text size: a whole multiple of the 12px pixel font, smaller in small screens. */
export function labelSize(visible: Rect): number {
  return 12 * Math.max(2, Math.min(4, Math.round(visible.width / 230)));
}

/** Divider widths in export units at full width; smaller pictures scale them down. */
export function lineWidth(line: "thin" | "thick" | "steps", visible: Rect): number {
  const full = { thin: 8, thick: 20, steps: 9 }[line];
  return Math.max(1, Math.round(full * Math.min(1, (1.6 * visible.width) / EXPORT_WIDTH)));
}
