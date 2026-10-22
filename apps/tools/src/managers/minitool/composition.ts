import { intersectRects, type Placement, type Rect } from "$/managers/minitool/split-geometry";

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
  Phone = "phone",
  Laptop = "laptop",
  Console = "console",
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
  ExportFrame.Phone,
  ExportFrame.Laptop,
  ExportFrame.Console,
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

/** How the pixelated picture's blocks fill an area. */
enum Fit {
  /** Fill the area, cropping the overflow (full-bleed exports). */
  Cover = "cover",
  /** Show every block, leaving bars (device screens). */
  Contain = "contain",
}

/** Whole-number block size so every exported block has the same width and stays crisp. */
function placeBlocks(area: Rect, grid: CanvasSize, fit: Fit): Placement {
  const columns = Math.max(1, grid.width);
  const rows = Math.max(1, grid.height);
  const cell =
    fit === Fit.Cover
      ? Math.ceil(Math.max(area.width / columns, area.height / rows))
      : Math.max(1, Math.floor(Math.min(area.width / columns, area.height / rows)));
  return {
    x: area.x + Math.round((area.width - columns * cell) / 2),
    y: area.y + Math.round((area.height - rows * cell) / 2),
    cell,
    columns,
    rows,
  };
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
const MAC_UNIT = 5;
/** Window chrome around the picture: borders, title, padding, inset frames and status bar. */
const MAC_CHROME_WIDTH = 2 * (MAC_WINDOW.border + MAC_WINDOW.padding + MAC_WINDOW.inset);
const MAC_CHROME_HEIGHT =
  2 * MAC_WINDOW.border +
  MAC_WINDOW.title +
  1 +
  2 * (MAC_WINDOW.padding + MAC_WINDOW.inset) +
  1 +
  MAC_WINDOW.status;
const MAC_MARGIN = { x: 130, y: 120 };

export interface MacWindowLayout {
  kind: ExportFrame.MacOS8;
  unit: number;
  window: Rect;
}
export interface PhoneLayout {
  kind: ExportFrame.Phone;
  scale: number;
  body: Rect;
  screen: Rect;
}
export interface LaptopLayout {
  kind: ExportFrame.Laptop;
  scale: number;
  lid: Rect;
  screen: Rect;
  base: Rect;
}
export interface ConsoleLayout {
  kind: ExportFrame.Console;
  scale: number;
  body: Rect;
  bezel: Rect;
}
interface PlainLayout {
  kind: ExportFrame.None;
}
type FrameLayout = MacWindowLayout | PhoneLayout | LaptopLayout | ConsoleLayout | PlainLayout;

export interface Composition {
  size: CanvasSize;
  frame: FrameLayout;
  /** Where the picture shows (clip to it). */
  area: Rect;
  /** The picture's blocks; may extend past `area` when cropped. */
  placement: Placement;
  /** The visible part of the picture: the split and labels live here. */
  visible: Rect;
  /** The Xprite mark under device frames; framed exports only. */
  watermark: { x: number; y: number; size: number } | null;
}

/** Design sizes at 1080 × 1440; other ratios scale them to fit. */
const DESIGN = { width: 1080, height: 1440 };
const WATERMARK_SIZE = 36;

function designScale(size: CanvasSize) {
  return Math.min(size.width / DESIGN.width, size.height / DESIGN.height);
}

function centred(size: CanvasSize, width: number, height: number, offsetY = 0): Rect {
  return {
    x: Math.round((size.width - width) / 2),
    y: Math.round((size.height - height) / 2 + offsetY),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function finish(
  size: CanvasSize,
  frame: FrameLayout,
  area: Rect,
  placement: Placement,
  watermarkTop: number | null,
  scale = 1,
): Composition {
  const picture = {
    x: placement.x,
    y: placement.y,
    width: placement.columns * placement.cell,
    height: placement.rows * placement.cell,
  };
  return {
    size,
    frame,
    area,
    placement,
    visible: intersectRects(area, picture),
    watermark:
      watermarkTop === null
        ? null
        : {
            x: size.width / 2,
            y: watermarkTop,
            size: Math.round(WATERMARK_SIZE * Math.max(scale, 0.75)),
          },
  };
}

/** Lay out one export: canvas size, frame parts and where the picture's blocks go. */
export function composeLayout(layout: LayoutState, grid: CanvasSize): Composition {
  const size = exportSize(layout.ratio);
  const scale = designScale(size);
  switch (layout.frame) {
    case ExportFrame.MacOS8: {
      // Smaller canvases (1:1) get finer window pixels and margins, so the picture stays large.
      const unit = Math.max(3, Math.round(MAC_UNIT * scale));
      const room = {
        width: size.width - 2 * Math.round(MAC_MARGIN.x * scale) - MAC_CHROME_WIDTH * unit,
        height: size.height - 2 * Math.round(MAC_MARGIN.y * scale) - MAC_CHROME_HEIGHT * unit,
      };
      const cell = Math.max(
        1,
        Math.floor(Math.min(room.width / grid.width, room.height / grid.height)),
      );
      const picture = { width: grid.width * cell, height: grid.height * cell };
      const window = centred(
        size,
        picture.width + MAC_CHROME_WIDTH * unit,
        picture.height + MAC_CHROME_HEIGHT * unit,
      );
      const area = {
        x: window.x + (MAC_WINDOW.border + MAC_WINDOW.padding + MAC_WINDOW.inset) * unit,
        y:
          window.y +
          (MAC_WINDOW.border + MAC_WINDOW.title + 1 + MAC_WINDOW.padding + MAC_WINDOW.inset) * unit,
        ...picture,
      };
      const placement = { x: area.x, y: area.y, cell, columns: grid.width, rows: grid.height };
      return finish(size, { kind: ExportFrame.MacOS8, unit, window }, area, placement, null);
    }
    case ExportFrame.Phone: {
      const body = centred(size, 600 * scale, 1220 * scale, -24 * scale);
      const bezel = 28 * scale;
      const screen = {
        x: body.x + bezel,
        y: body.y + bezel,
        width: body.width - 2 * bezel,
        height: body.height - 2 * bezel,
      };
      const placement = placeBlocks(screen, grid, Fit.Contain);
      return finish(
        size,
        { kind: ExportFrame.Phone, scale, body, screen },
        screen,
        placement,
        body.y + body.height + (size.height - body.y - body.height) / 2,
        scale,
      );
    }
    case ExportFrame.Laptop: {
      const lid = centred(size, 900 * scale, 590 * scale, -60 * scale);
      const bezel = 30 * scale;
      const screen = {
        x: lid.x + bezel,
        y: lid.y + bezel,
        width: lid.width - 2 * bezel,
        height: lid.height - 2 * bezel,
      };
      const base = {
        x: lid.x - 50 * scale,
        y: lid.y + lid.height,
        width: lid.width + 100 * scale,
        height: 44 * scale,
      };
      const placement = placeBlocks(screen, grid, Fit.Contain);
      return finish(
        size,
        { kind: ExportFrame.Laptop, scale, lid, screen, base },
        screen,
        placement,
        Math.min(size.height - 70 * scale, base.y + base.height + 150 * scale),
        scale,
      );
    }
    case ExportFrame.Console: {
      const body = centred(size, 820 * scale, 1320 * scale);
      const bezel = {
        x: body.x + 70 * scale,
        y: body.y + 70 * scale,
        width: 680 * scale,
        height: 700 * scale,
      };
      const screen = {
        x: bezel.x + 60 * scale,
        y: bezel.y + 40 * scale,
        width: 560 * scale,
        height: 620 * scale,
      };
      const placement = placeBlocks(screen, grid, Fit.Contain);
      return finish(
        size,
        { kind: ExportFrame.Console, scale, body, bezel },
        screen,
        placement,
        null,
      );
    }
    default: {
      const area = { x: 0, y: 0, ...size };
      return finish(
        size,
        { kind: ExportFrame.None },
        area,
        placeBlocks(area, grid, Fit.Cover),
        null,
      );
    }
  }
}

/** Label text size: a whole multiple of the 12px pixel font, smaller in small screens. */
export function labelSize(visible: Rect): number {
  return 12 * Math.max(2, Math.min(4, Math.round(visible.width / 230)));
}

/** Divider widths in export units at full width; smaller pictures scale them down. */
export function lineWidth(line: "thin" | "thick" | "steps", visible: Rect): number {
  const full = { thin: 8, thick: 20, steps: 9 }[line];
  return Math.max(3, Math.round(full * Math.min(1, Math.max(0.5, visible.width / EXPORT_WIDTH))));
}
