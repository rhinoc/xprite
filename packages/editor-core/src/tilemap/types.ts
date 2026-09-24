/** Pixel-addressed tile placements, independent from timeline layer storage. */
export enum TilesetMode {
  Manual = "manual",
  Auto = "auto",
  Stack = "stack",
}

export enum TilemapDisplayMode {
  Tiles = "tiles",
  Pixels = "pixels",
}

export const TILESET_EMBEDDED_PIXELS_FLAG = 1 << 1;
export const TILESET_MATCH_FLAGS_MASK = 0x38;

export interface TilemapImage {
  width: number;
  height: number;
  tiles: Uint32Array;
}
