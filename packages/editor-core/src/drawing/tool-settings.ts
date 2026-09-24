import type { BitmapFont, Brush, Rgba } from "$/base/primitives";
import type {
  EyedropperChannel,
  EyedropperSample,
  GradientDither,
  GradientType,
} from "$/drawing/types";
import {
  SelectionMode,
  type SelectionPivotPosition,
  type SelectionRotationAlgorithm,
} from "$/selection/types";
import type { TilemapDisplayMode, TilesetMode } from "$/tilemap/types";

export enum AsepriteInk {
  Simple = "simple",
  AlphaCompositing = "alpha-compositing",
  CopyColor = "copy-color",
  LockAlpha = "lock-alpha",
  Shading = "shading",
}

export enum FillReference {
  ActiveLayer = "active-layer",
  VisibleLayers = "visible-layers",
}

export enum RightClickMode {
  PaintBackground = "paint-background",
  PickForeground = "pick-foreground",
  Erase = "erase",
  Scroll = "scroll",
  RectangularMarquee = "rectangular-marquee",
  Lasso = "lasso",
  SelectLayerAndMove = "select-layer-and-move",
}

export enum AsepriteDynamicSensor {
  Static = "static",
  Pressure = "pressure",
  Velocity = "velocity",
}

export enum AsepriteDynamicsColorDirection {
  BackgroundToForeground = "bg-to-fg",
  ForegroundToBackground = "fg-to-bg",
}

export interface AsepriteDynamicsSettings {
  stabilizer: boolean;
  stabilizerFactor: number;
  size: AsepriteDynamicSensor;
  angle: AsepriteDynamicSensor;
  gradient: AsepriteDynamicSensor;
  minSize: number;
  minAngle: number;
  minPressureThreshold: number;
  maxPressureThreshold: number;
  minVelocityThreshold: number;
  maxVelocityThreshold: number;
  colorFromTo: AsepriteDynamicsColorDirection;
  matrixName: string;
}

export enum EditorToolId {
  Marquee = "marquee",
  Lasso = "lasso",
  EllipticalMarquee = "elliptical_marquee",
  PolygonalLasso = "polygonal_lasso",
  MagicWand = "magic_wand",
  Pencil = "pencil",
  Spray = "spray",
  Eraser = "eraser",
  Eyedropper = "eyedropper",
  Zoom = "zoom",
  Hand = "hand",
  Move = "move",
  Bucket = "bucket",
  Line = "line",
  Rectangle = "rectangle",
  FilledRectangle = "filled_rectangle",
  Ellipse = "ellipse",
  FilledEllipse = "filled_ellipse",
  Curve = "curve",
  Polygon = "polygon",
  Gradient = "gradient",
  Contour = "contour",
  Blur = "blur",
  Jumble = "jumble",
  Text = "text",
  Slice = "slice",
}
export type EditorTool = `${EditorToolId}`;

export const DEFAULT_LAYER_EDGES_COLOR = "#0000ffff";
export const DEFAULT_AUTO_GUIDES_COLOR = "#0000ff80";
export const DEFAULT_SLICE_COLOR = "#0000ffff";

export interface ToolSettings {
  shareInk?: boolean;
  shareDynamics?: boolean;
  sliceUseKeys?: boolean;
  layerEdgesColor?: string;
  autoGuidesColor?: string;
  defaultSliceColor?: string;
  tilemapMode?: TilemapDisplayMode;
  tilesetMode?: TilesetMode;
  selectedTile?: number;
  backgroundTile?: number;
  /** App-global experimental renderer preference; default value is false. */
  composeGroups?: boolean;
  symmetryEnabled?: boolean;
  shade?: readonly Rgba[];
  shadeIndices?: readonly number[];
  ink?: AsepriteInk;
  dynamics?: AsepriteDynamicsSettings;
  selectionMode?: SelectionMode;
  selectionOpaque?: boolean;
  selectionAutoOpaque?: boolean;
  selectionKeepAfterClear?: boolean;
  selectionAutoShowEdges?: boolean;
  selectionDoubleClickSelectTile?: boolean;
  selectionMoveEdges?: boolean;
  selectionModifiersDisableHandles?: boolean;
  selectionMoveOnAddMode?: boolean;
  selectionMulticelWhenLayersOrFrames?: boolean;
  straightLinePreview?: boolean;
  discardBrushOnEyedropper?: boolean;
  rightClickMode?: RightClickMode;
  selectionTransparentColor?: Rgba;
  selectionRotationAlgorithm?: SelectionRotationAlgorithm;
  selectionPivotPosition?: SelectionPivotPosition;
  selectionPivotVisible?: boolean;
  selectionCornerRadius?: number;
  rectangleCornerRadius?: number;
  gradientType?: GradientType;
  gradientDither?: GradientDither;
  fillReference: FillReference;
  tool: EditorTool;
  sprayWidth: number;
  spraySpeed: number;
  foreground: Rgba;
  background: Rgba;
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  brush: Brush;
  opacity: number;
  tolerance: number;
  contiguous: boolean;
  text: string;
  font: BitmapFont | null;
  textFontFamily: string;
  textBold: boolean;
  textItalic: boolean;
  textAntialias: boolean;
  textFontSize: number;
  textFill: boolean;
  textStrokeWidth: number;
  textScale: number;
  pixelPerfect: boolean;
  autoSelectLayer: boolean;
  eyedropperChannel: EyedropperChannel;
  eyedropperSample: EyedropperSample;
}
