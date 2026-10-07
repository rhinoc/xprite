import type { PixelBuffer } from "@xprite/editor-core/base";

export enum IslandGround {
  Green = "green",
  Spring = "spring",
  Autumn = "autumn",
}
export enum IslandArrangement {
  Nearby = "nearby",
  Repeat = "repeat",
}
export enum IslandCamera {
  Overview = "overview",
  Top = "top",
  Close = "close",
}
export enum IslandFilter {
  Smooth = "smooth",
  Pixels = "pixels",
}
export enum IslandColors {
  Original = "original",
  Qr = "qr",
}
export interface IslandSurface {
  pixels: PixelBuffer;
  columns: number;
  rows: number;
  repeat: boolean;
  ground: IslandGround;
  filter: IslandFilter;
  grid: boolean;
}
export interface IslandScene {
  setSurface(surface: IslandSurface | null): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  setCamera(camera: IslandCamera): void;
  dispose(): void;
}
export interface IslandPreviewPort {
  create(host: HTMLElement): Promise<IslandScene>;
}
