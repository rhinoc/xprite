import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  EffectKind,
  EffectTarget,
  HueSaturationMode,
  UINT8_MAX,
  type EffectSpec,
  ConvolutionPreset,
  DEFAULT_MEDIAN_SIZE,
  MAX_MEDIAN_SIZE,
  normalizeColorCurve,
  type ColorCurvePoint,
} from "@xprite/editor-core";

const STORAGE_KEY = "xse.filters.preferences.v1";
const DEFAULT_OUTLINE_MATRIX = 170;
const MAX_OUTLINE_MATRIX = 511;
interface EffectPreferences {
  target: EffectTarget;
  preview: Partial<Record<EffectKind, boolean>>;
  hueMode: HueSaturationMode;
  replaceTolerance: number;
  outline: { place: "outside" | "inside"; matrix: number };
  median: { width: number; height: number };
  convolution: ConvolutionPreset;
  curve: readonly ColorCurvePoint[];
}
function defaults(): EffectPreferences {
  return {
    target: EffectTarget.Selected,
    preview: {},
    hueMode: HueSaturationMode.HslMul,
    replaceTolerance: 0,
    outline: { place: "outside", matrix: DEFAULT_OUTLINE_MATRIX },
    median: { width: DEFAULT_MEDIAN_SIZE, height: DEFAULT_MEDIAN_SIZE },
    convolution: ConvolutionPreset.GaussianBlur,
    curve: [
      { x: 0, y: 0 },
      { x: UINT8_MAX, y: UINT8_MAX },
    ],
  };
}
function normalize(value: unknown): EffectPreferences {
  const source = value && typeof value === "object" ? (value as Partial<EffectPreferences>) : {};
  const next = defaults();
  if (Object.values(EffectTarget).includes(source.target as EffectTarget))
    next.target = source.target!;
  if (Object.values(HueSaturationMode).includes(source.hueMode as HueSaturationMode))
    next.hueMode = source.hueMode!;
  for (const kind of Object.values(EffectKind))
    if (typeof source.preview?.[kind] === "boolean") next.preview[kind] = source.preview[kind];
  if (typeof source.replaceTolerance === "number" && Number.isFinite(source.replaceTolerance))
    next.replaceTolerance = Math.round(Math.max(0, Math.min(UINT8_MAX, source.replaceTolerance)));
  if (source.outline?.place === "inside") next.outline.place = "inside";
  if (
    Number.isSafeInteger(source.outline?.matrix) &&
    source.outline!.matrix >= 0 &&
    source.outline!.matrix <= MAX_OUTLINE_MATRIX
  )
    next.outline.matrix = source.outline!.matrix;
  for (const dimension of ["width", "height"] as const) {
    const size = source.median?.[dimension];
    if (typeof size === "number" && Number.isFinite(size))
      next.median[dimension] = Math.max(1, Math.min(MAX_MEDIAN_SIZE, Math.round(size)));
  }
  if (Object.values(ConvolutionPreset).includes(source.convolution as ConvolutionPreset))
    next.convolution = source.convolution!;
  if (Array.isArray(source.curve)) {
    try {
      next.curve = normalizeColorCurve(source.curve);
    } catch {
      /* Keep the identity curve. */
    }
  }
  return next;
}
/** Aseprite remembers preview/target and hue mode even on Cancel; accepted
 * parameter defaults are saved only when the command accepts the window. */
export class EffectDialogPreferences {
  private state = defaults();
  private serialized = "";
  constructor(private readonly storage?: PreferenceStoragePort) {
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
      if (saved?.version === 1) this.state = normalize(saved.preferences);
    } catch {
      /* Defaults remain available if persisted preferences are malformed. */
    }
  }
  get target() {
    return this.state.target;
  }
  get preview() {
    return this.state.preview;
  }
  initial(spec: EffectSpec): EffectSpec {
    if (spec.kind === EffectKind.HueSaturation) return { ...spec, mode: this.state.hueMode };
    if (spec.kind === EffectKind.ReplaceColor)
      return { ...spec, tolerance: this.state.replaceTolerance };
    if (spec.kind === EffectKind.Outline) return { ...spec, ...this.state.outline };
    if (spec.kind === EffectKind.MedianBlur) return { ...spec, ...this.state.median };
    if (spec.kind === EffectKind.ConvolutionMatrix)
      return { ...spec, preset: this.state.convolution };
    if (spec.kind === EffectKind.ColorCurve)
      return { ...spec, points: this.state.curve.map((point) => ({ ...point })) };
    return spec;
  }
  remember(target: EffectTarget, kind: EffectKind, preview: boolean, spec: EffectSpec) {
    this.update({
      ...this.state,
      target,
      preview: { ...this.state.preview, [kind]: preview },
      ...(spec.kind === EffectKind.HueSaturation ? { hueMode: spec.mode } : {}),
    });
  }
  accepted(spec: EffectSpec) {
    this.update({
      ...this.state,
      ...(spec.kind === EffectKind.ReplaceColor ? { replaceTolerance: spec.tolerance } : {}),
      ...(spec.kind === EffectKind.Outline
        ? { outline: { place: spec.place, matrix: spec.matrix } }
        : {}),
      ...(spec.kind === EffectKind.MedianBlur
        ? { median: { width: spec.width, height: spec.height } }
        : {}),
      ...(spec.kind === EffectKind.ConvolutionMatrix ? { convolution: spec.preset } : {}),
      ...(spec.kind === EffectKind.ColorCurve ? { curve: spec.points } : {}),
    });
  }
  reset() {
    this.update(defaults());
  }
  private update(value: EffectPreferences) {
    this.state = normalize(value);
    const serialized = JSON.stringify({ version: 1, preferences: this.state });
    if (serialized === this.serialized) return;
    try {
      this.storage?.setItem(STORAGE_KEY, serialized);
      this.serialized = serialized;
    } catch {
      /* The current workspace still remembers the updated settings. */
    }
  }
}
