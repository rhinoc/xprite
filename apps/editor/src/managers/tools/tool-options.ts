import {
  BrushImagePattern,
  EyedropperChannel,
  EyedropperSample,
  FillReference,
  GradientDither,
  GradientType,
  INT16_MAX,
  INT16_MIN,
  AsepriteDynamicSensor,
  AsepriteDynamicsColorDirection,
  AsepriteInk,
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
  asepriteBrushMask,
  type BrushImage,
  type AsepriteBrushShape,
  type AsepriteBrushValue,
  type Rgba,
} from "@xprite/editor-core";

/** Narrow domain names for settings presented by the editor's tool controls. */
export type BrushPickerValue = AsepriteBrushValue;
export type BrushPickerShape = AsepriteBrushShape;
export type BrushPickerImage = BrushImage;
export type ToolColor = Rgba;
export const BrushImagePatternChoice = BrushImagePattern;
export type BrushImagePatternChoice = BrushImagePattern;
export const ToolInk = AsepriteInk;
export type ToolInk = AsepriteInk;
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
export const DynamicsSensorControl = AsepriteDynamicSensor;
export type DynamicsSensorControl = AsepriteDynamicSensor;
export const DynamicsColorFlow = AsepriteDynamicsColorDirection;
export type DynamicsColorFlow = AsepriteDynamicsColorDirection;
export const PaletteMenuOperation = PaletteOperation;
export type PaletteMenuOperation = PaletteOperation;
export const ContextBarResizeMethod = PixelResizeMethod;
export const TOOL_CONTROL_CHANNEL_MAX = UINT8_MAX;
export const MIN_TILEMAP_BASE_INDEX = INT16_MIN;
export const MAX_TILEMAP_BASE_INDEX = INT16_MAX;

export function getBrushPickerMask(value: BrushPickerValue) {
  return asepriteBrushMask(value);
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
