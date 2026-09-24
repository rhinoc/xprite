import type { Rgba } from "$/base/primitives";

export interface AsepriteIndexWriter {
  resolve?(x: number, y: number, color: Rgba): Rgba;
  read(x: number, y: number): number | undefined;
  write(x: number, y: number, color: Rgba, explicitIndex?: number): boolean;
}
