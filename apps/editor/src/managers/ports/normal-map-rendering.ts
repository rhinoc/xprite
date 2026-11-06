import type { PixelBuffer, Point } from "@xprite/editor-core/base";
import type { NormalMapLightOptions } from "@xprite/editor-core/image-editing";

export interface NormalMapLightFrame {
  source: PixelBuffer;
  normals: PixelBuffer | null;
  options: NormalMapLightOptions;
  viewport: { width: number; height: number };
  origin: Point;
  zoom: number;
  pixelRatio: number;
}
export interface NormalMapLightRendererPort {
  render(frame: NormalMapLightFrame): void;
  dispose(): void;
}
export type NormalMapLightRendererFactory = (
  canvas: HTMLCanvasElement,
) => NormalMapLightRendererPort | null;
