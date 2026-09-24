import type { Point } from "$/base/primitives";
import type { OnionSkinSettings, PlaybackSettings } from "$/timeline/types";

export enum DocumentShowOption {
  Grid = "grid",
  PixelGrid = "pixelGrid",
  SelectionEdges = "selectionEdges",
  Guides = "guides",
  LayerEdges = "layerEdges",
  Slices = "slices",
  TileNumbers = "tileNumbers",
  BrushPreview = "brushPreview",
}

export interface DocumentViewOptions {
  onionSkin: OnionSkinSettings | undefined;
  playback: PlaybackSettings | undefined;
  symmetryMode: number | undefined;
  symmetryX: number | undefined;
  symmetryY: number | undefined;
  tiledMode: 0 | 1 | 2 | 3 | undefined;
  gridX: number | undefined;
  gridY: number | undefined;
  snapToGrid: boolean | undefined;
  grid: boolean;
  pixelGrid: boolean;
  selectionEdges: boolean;
  guides: boolean;
  layerEdges: boolean;
  slices: boolean;
  tileNumbers: boolean;
  brushPreview: boolean;
  gridWidth: number;
  gridHeight: number;
}

export interface ViewSettings extends DocumentViewOptions {
  nonActiveLayersOpacity?: number;
  zoomFromCenterWithKeys?: boolean;
  zoom: number;
  pan: Point;
  appearance: "light" | "dark";
}
