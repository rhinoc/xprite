import type { Composition } from "$/managers/minitool/composition";
import type { ExportContent } from "$/managers/minitool/composition";
import type { SplitState } from "$/managers/minitool/split-geometry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { PixelateOptions } from "@xprite/editor-core/import-export";

/** Everything one export (or its preview) draws. */
export interface MiniToolScene {
  composition: Composition;
  split: SplitState;
  content: ExportContent;
  original: PixelBuffer;
  pixels: PixelBuffer;
  /** The photo's file name, shown in the Mac OS 8 title bar. */
  title: string;
  labels: { original: string; pixels: string };
  /** Divider width multiplier, so the line still shows in small thumbnails. */
  lineScale?: number;
}

/** Draws scenes; previews and exports share it so an export is exactly what the preview shows. */
export interface MiniToolRenderer {
  /** Fonts and images the drawings use; draw after it settles for the final look. */
  ready(): Promise<void>;
  /** Draw at `scale` device pixels per export unit, resizing the canvas to fit. */
  draw(canvas: HTMLCanvasElement, scene: MiniToolScene, scale: number): void;
}

export enum MiniToolTarget {
  Album = "album",
  Note = "note",
}

export enum MiniToolOutcome {
  /** Saved to the album, or the note editor opened. */
  Done = "done",
  /** A browser on this computer downloaded the file instead (development preview). */
  Downloaded = "downloaded",
}

export interface MiniToolPort {
  renderer: MiniToolRenderer;
  /** Pixelate a small copy for a preset thumbnail, off the main conversion queue. */
  preview(image: PixelBuffer, options: PixelateOptions): Promise<PixelBuffer>;
  /** A copy whose longer side is at most `longSide`. */
  shrink(image: PixelBuffer, longSide: number): PixelBuffer;
  /** Render the full export and hand it to the container. */
  output(scene: MiniToolScene, target: MiniToolTarget): Promise<MiniToolOutcome>;
}
