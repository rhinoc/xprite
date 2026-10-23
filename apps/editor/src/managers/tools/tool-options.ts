import {
  BrushImagePattern,
  EyedropperChannel,
  EyedropperSample,
  FillReference,
  GradientDither,
  GradientType,
  INT16_MAX,
  INT16_MIN,
  BrushDynamicInput,
  BrushColorOrder,
  PaintInk,
  PaletteOperation,
  PixelResizeMethod,
  SelectionMode,
  SelectionModifier,
  SelectionPivotPosition,
  SelectionRotationAlgorithm,
  TilemapDisplayMode,
  UINT8_MAX,
  getXpriteToolCapabilities,
  isSelectionTool,
  isTwoPointShape,
  brushPreviewMask,
  type BrushImage,
  type BrushShape,
  type BrushValue,
  type Rgba,
} from "@xprite/editor-core";

/** Narrow domain names for settings presented by the editor's tool controls. */
export type BrushPickerValue = BrushValue;
export type BrushPickerShape = BrushShape;
export type BrushPickerImage = BrushImage;
export type ToolColor = Rgba;
export const BrushImagePatternChoice = BrushImagePattern;
export type BrushImagePatternChoice = BrushImagePattern;
export const ToolInk = PaintInk;
export type ToolInk = PaintInk;
export const ToolSelectionMode = SelectionMode;
export type ToolSelectionMode = SelectionMode;
export const ToolSelectionModifier = SelectionModifier;
export type ToolSelectionModifier = SelectionModifier;
export const ToolSelectionPivotPosition = SelectionPivotPosition;
export type ToolSelectionPivotPosition = SelectionPivotPosition;
export const ToolSelectionRotationAlgorithm = SelectionRotationAlgorithm;
export type ToolSelectionRotationAlgorithm = SelectionRotationAlgorithm;
export const ToolTilemapDisplayMode = TilemapDisplayMode;
export type ToolTilemapDisplayMode = TilemapDisplayMode;
export const ToolGradientType = GradientType;
export type ToolGradientType = GradientType;
export const ToolGradientDither = GradientDither;
export type ToolGradientDither = GradientDither;
export const ToolFillReference = FillReference;
export type ToolFillReference = FillReference;
export const ToolEyedropperChannel = EyedropperChannel;
export type ToolEyedropperChannel = EyedropperChannel;
export const ToolEyedropperSample = EyedropperSample;
export type ToolEyedropperSample = EyedropperSample;
export const DynamicsSensorControl = BrushDynamicInput;
export type DynamicsSensorControl = BrushDynamicInput;
export const DynamicsColorFlow = BrushColorOrder;
export type DynamicsColorFlow = BrushColorOrder;
export const PaletteMenuOperation = PaletteOperation;
export type PaletteMenuOperation = PaletteOperation;
export const ContextBarResizeMethod = PixelResizeMethod;
export const TOOL_CONTROL_CHANNEL_MAX = UINT8_MAX;
export const MIN_TILEMAP_BASE_INDEX = INT16_MIN;
export const MAX_TILEMAP_BASE_INDEX = INT16_MAX;

export function getBrushPickerMask(value: BrushPickerValue) {
  return brushPreviewMask(value);
}

/** Only the view-facing capability fields used to place tool controls. */
export function getToolControlCapabilities(tool: string) {
  const { controls, settings } = getXpriteToolCapabilities(tool);
  return {
    controls: {
      brushType: controls.brushType,
      brushSize: controls.brushSize,
      brushAngle: controls.brushAngle,
      opacity: controls.opacity,
      dynamics: controls.dynamics,
      dynamicsOptionsGrid: controls.dynamicsOptionsGrid,
      pixelAlgorithm: controls.pixelAlgorithm,
    },
    settings: { hasInk: settings.hasInk },
  };
}

export function isTwoPointToolShape(tool: string): boolean {
  return isTwoPointShape(tool);
}

export function isSelectionToolMode(tool: string): boolean {
  return isSelectionTool(tool);
}
