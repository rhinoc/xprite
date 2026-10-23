import { UINT8_MAX } from "$/base/numeric-constants";
import type { Brush, Rgba } from "$/base/primitives";
import {
  MYPAINT_PRESSURE_GAIN_LOG_LIMIT,
  MYPAINT_SLOW_TRACKING_MAX,
} from "$/canvas/raster/mypaint";
import { MAX_TEXT_FONT_SIZE } from "$/drawing/text/font-settings";
import {
  DynamicsColorOrder,
  DynamicsInput,
  EditorToolId,
  FillReference,
  InkMode,
  type BrushDynamicsSettings,
  type EditorTool,
  type ToolSettings,
} from "$/drawing/tool-settings";
import { EyedropperChannel, EyedropperSample } from "$/drawing/types";
import { SelectionPivotPosition, SelectionRotationAlgorithm } from "$/selection/types";

/** libmypaint defaults leave slow tracking and pressure gain off. */
export const DEFAULT_DYNAMICS_SETTINGS: Readonly<BrushDynamicsSettings> = {
  slowTracking: 0,
  pressureGain: 0,
  sizeInput: DynamicsInput.None,
  sizeLow: 1,
  angleInput: DynamicsInput.None,
  angleLow: 0,
  colorInput: DynamicsInput.None,
  colorOrder: DynamicsColorOrder.BackgroundToForeground,
  ditherMatrix: "",
};

export type ToolParameterPreferences = Pick<
  ToolSettings,
  | "ink"
  | "opacity"
  | "dynamics"
  | "tolerance"
  | "contiguous"
  | "fillReference"
  | "sprayWidth"
  | "spraySpeed"
  | "selectionCornerRadius"
  | "rectangleCornerRadius"
>;

export interface PersistentToolPreferences {
  version: 1;
  settings: Partial<ToolSettings>;
  brushes: readonly (readonly [EditorTool, Brush])[];
  pixelPerfect: readonly (readonly [EditorTool, boolean])[];
  parameters: readonly (readonly [EditorTool, ToolParameterPreferences])[];
}

// Interaction drafts, palette indices, image brushes, fonts and the active tool
// are intentionally excluded. These preferences are independent of artwork.
const BOOLEAN_SETTINGS = [
  "shareInk",
  "shareDynamics",
  "contiguous",
  "selectionOpaque",
  "selectionPivotVisible",
  "textBold",
  "textItalic",
  "textAntialias",
  "textFill",
  "autoSelectLayer",
  "symmetryEnabled",
] as const;
const ENUM_SETTINGS = {
  ink: InkMode,
  fillReference: FillReference,
  eyedropperChannel: EyedropperChannel,
  eyedropperSample: EyedropperSample,
  selectionRotationAlgorithm: SelectionRotationAlgorithm,
  selectionPivotPosition: SelectionPivotPosition,
} as const;
const NUMBER_SETTINGS = {
  opacity: [0, UINT8_MAX],
  tolerance: [0, UINT8_MAX],
  sprayWidth: [1, 32],
  spraySpeed: [1, 100],
  selectionCornerRadius: [0, Number.MAX_SAFE_INTEGER],
  rectangleCornerRadius: [0, Number.MAX_SAFE_INTEGER],
  textScale: [1, 64],
  textFontSize: [1, MAX_TEXT_FONT_SIZE],
  textStrokeWidth: [0, 10],
} as const;
const TOOL_PARAMETER_KEYS = [
  "ink",
  "opacity",
  "dynamics",
  "tolerance",
  "contiguous",
  "fillReference",
  "sprayWidth",
  "spraySpeed",
  "selectionCornerRadius",
  "rectangleCornerRadius",
] as const;
const MAX_BRUSH_SIZE = 64;
const MAX_BRUSH_ANGLE = 180;
const MAX_FONT_FAMILY_LENGTH = 256;
const MAX_MATRIX_NAME_LENGTH = 256;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function finite(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : undefined;
}
function color(value: unknown): Rgba | undefined {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((channel) => typeof channel === "number" && Number.isFinite(channel))
    ? (value.map((channel) =>
        Math.round(Math.max(0, Math.min(UINT8_MAX, channel))),
      ) as unknown as Rgba)
    : undefined;
}
export function normalizeDynamicsSettings(value: unknown): BrushDynamicsSettings {
  const source = record(value);
  const next = { ...DEFAULT_DYNAMICS_SETTINGS };
  const inputs = Object.values(DynamicsInput) as unknown[];
  for (const key of ["sizeInput", "angleInput", "colorInput"] as const)
    if (inputs.includes(source[key])) next[key] = source[key] as DynamicsInput;
  if ((Object.values(DynamicsColorOrder) as unknown[]).includes(source.colorOrder))
    next.colorOrder = source.colorOrder as DynamicsColorOrder;
  next.slowTracking =
    finite(source.slowTracking, 0, MYPAINT_SLOW_TRACKING_MAX) ?? next.slowTracking;
  next.pressureGain =
    finite(
      source.pressureGain,
      -MYPAINT_PRESSURE_GAIN_LOG_LIMIT,
      MYPAINT_PRESSURE_GAIN_LOG_LIMIT,
    ) ?? next.pressureGain;
  next.sizeLow = Math.round(finite(source.sizeLow, 1, MAX_BRUSH_SIZE) ?? next.sizeLow);
  next.angleLow = Math.round(
    finite(source.angleLow, -MAX_BRUSH_ANGLE, MAX_BRUSH_ANGLE) ?? next.angleLow,
  );
  if (typeof source.ditherMatrix === "string")
    next.ditherMatrix = source.ditherMatrix.slice(0, MAX_MATRIX_NAME_LENGTH);
  return next;
}
export function persistentToolSettings(value: unknown): Partial<ToolSettings> {
  const source = record(value);
  const next: Record<string, unknown> = {};
  for (const key of BOOLEAN_SETTINGS) if (typeof source[key] === "boolean") next[key] = source[key];
  for (const [key, values] of Object.entries(ENUM_SETTINGS))
    if ((Object.values(values) as unknown[]).includes(source[key])) next[key] = source[key];
  for (const [key, [min, max]] of Object.entries(NUMBER_SETTINGS)) {
    const number = finite(source[key], min, max);
    if (number !== undefined) next[key] = key === "textStrokeWidth" ? number : Math.round(number);
  }
  for (const key of ["foreground", "background", "selectionTransparentColor"] as const) {
    const rgba = color(source[key]);
    if (rgba) next[key] = rgba;
  }
  if (typeof source.textFontFamily === "string" && source.textFontFamily.trim())
    next.textFontFamily = source.textFontFamily.trim().slice(0, MAX_FONT_FAMILY_LENGTH);
  if (source.dynamics) next.dynamics = normalizeDynamicsSettings(source.dynamics);
  return next;
}
export function toolParameterPreferences(
  settings: Partial<ToolSettings>,
): ToolParameterPreferences {
  return Object.fromEntries(
    TOOL_PARAMETER_KEYS.filter((key) => settings[key] !== undefined).map((key) => [
      key,
      settings[key],
    ]),
  ) as ToolParameterPreferences;
}
export function cloneToolParameterPreferences(
  value: ToolParameterPreferences,
): ToolParameterPreferences {
  return { ...value, ...(value.dynamics ? { dynamics: { ...value.dynamics } } : {}) };
}
export function persistentBrush(brush: unknown): Brush {
  const source = record(brush);
  return {
    shape: source.shape === "square" || source.shape === "line" ? source.shape : "circle",
    size: Math.round(finite(source.size, 1, MAX_BRUSH_SIZE) ?? 1),
    angle: Math.round(finite(source.angle, -MAX_BRUSH_ANGLE, MAX_BRUSH_ANGLE) ?? 0),
  };
}
export function normalizePersistentToolPreferences(
  value: unknown,
): PersistentToolPreferences | null {
  const source = record(value);
  if (source.version !== 1) return null;
  const entries = (value: unknown): [EditorTool, unknown][] =>
    Array.isArray(value)
      ? value.filter(
          (entry): entry is [EditorTool, unknown] =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            Object.values(EditorToolId).includes(entry[0] as EditorToolId),
        )
      : [];
  return {
    version: 1,
    settings: persistentToolSettings(source.settings),
    brushes: entries(source.brushes).map(([tool, brush]) => [tool, persistentBrush(brush)]),
    pixelPerfect: entries(source.pixelPerfect)
      .filter(([, enabled]) => typeof enabled === "boolean")
      .map(([tool, enabled]) => [tool, enabled as boolean]),
    parameters: entries(source.parameters).map(([tool, settings]) => [
      tool,
      toolParameterPreferences(persistentToolSettings(settings)),
    ]),
  };
}
