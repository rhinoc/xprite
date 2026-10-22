import type { Rect } from "$/shared/frames/geometry";
import { EXPORT_WIDTH } from "$/shared/frames/layout";

/** What the export shows: the before/after split, or only the pixelated picture. */
export enum ExportContent {
  Split = "split",
  Pixels = "pixels",
}

/** The longest window title or caption the 边框 tab accepts. */
export const TITLE_MAX = 40;

/** The title a photo opens with: its file name without the extension. */
export function defaultTitle(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, TITLE_MAX);
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
