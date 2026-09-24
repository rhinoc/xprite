import { useEffect } from "react";

import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";
import {
  canOpenEffect,
  defaultEffect,
  effectChannels,
  EffectKind,
  EffectTarget,
  HueSaturationMode,
  isBackgroundLayer,
  OUTLINE_MATRICES,
  updateEffectColor,
  ConvolutionPreset,
  convolutionKernel,
  normalizeColorCurve,
  MAX_MEDIAN_SIZE,
  UINT8_MAX,
} from "@xprite/editor-core";
import type { EffectSpec, Rgba } from "@xprite/editor-core";

export const DialogEffectKind = Object.freeze({
  ReplaceColor: EffectKind.ReplaceColor,
  HueSaturation: EffectKind.HueSaturation,
  BrightnessContrast: EffectKind.BrightnessContrast,
  Invert: EffectKind.Invert,
  Outline: EffectKind.Outline,
  MedianBlur: EffectKind.MedianBlur,
  ConvolutionMatrix: EffectKind.ConvolutionMatrix,
  ColorCurve: EffectKind.ColorCurve,
});
export type DialogEffectKind = (typeof DialogEffectKind)[keyof typeof DialogEffectKind];

export const DialogEffectTarget = Object.freeze({
  All: EffectTarget.All,
  Selected: EffectTarget.Selected,
});
export type DialogEffectTarget = (typeof DialogEffectTarget)[keyof typeof DialogEffectTarget];

export const DialogHueSaturationMode = Object.freeze({
  HsvMul: HueSaturationMode.HsvMul,
  HslMul: HueSaturationMode.HslMul,
  HsvAdd: HueSaturationMode.HsvAdd,
  HslAdd: HueSaturationMode.HslAdd,
});
export type DialogHueSaturationMode =
  (typeof DialogHueSaturationMode)[keyof typeof DialogHueSaturationMode];

export const DIALOG_OUTLINE_MATRICES = OUTLINE_MATRICES;
export type DialogEffectSpec = EffectSpec;
export type DialogColor = Rgba;
export const MAX_DIALOG_MEDIAN_SIZE = MAX_MEDIAN_SIZE;
export const DIALOG_CONVOLUTION_PRESETS = [
  { value: ConvolutionPreset.Identity, label: "Identity" },
  { value: ConvolutionPreset.BoxBlur, label: "Box Blur" },
  { value: ConvolutionPreset.GaussianBlur, label: "Gaussian Blur" },
  { value: ConvolutionPreset.Sharpen, label: "Sharpen" },
  { value: ConvolutionPreset.EdgeDetect, label: "Edge Detection" },
  { value: ConvolutionPreset.Emboss, label: "Emboss" },
  { value: ConvolutionPreset.HorizontalEdges, label: "Horizontal Edges" },
  { value: ConvolutionPreset.VerticalEdges, label: "Vertical Edges" },
] as const;

export function dialogConvolutionKernel(
  spec: Extract<DialogEffectSpec, { kind: EffectKind.ConvolutionMatrix }>,
) {
  return convolutionKernel(spec.preset);
}

export function updateDialogCurvePoint(
  spec: Extract<DialogEffectSpec, { kind: EffectKind.ColorCurve }>,
  index: number,
  key: "x" | "y",
  value: number,
): DialogEffectSpec {
  if (!Number.isFinite(value) || !spec.points[index]) return spec;
  const low = key === "x" && index ? spec.points[index - 1].x + 1 : 0;
  const high =
    key === "x" && index + 1 < spec.points.length ? spec.points[index + 1].x - 1 : UINT8_MAX;
  const points = spec.points.map((point, at) =>
    at === index ? { ...point, [key]: Math.max(low, Math.min(high, Math.round(value))) } : point,
  );
  return { ...spec, points: normalizeColorCurve(points) };
}

export function createDialogEffect(
  kind: DialogEffectKind,
  foreground: DialogColor,
  background: DialogColor,
  backgroundPixel?: DialogColor,
  indices?: {
    foregroundIndex?: number | null;
    backgroundIndex?: number | null;
    outlineBackgroundIndex?: number | null;
  },
): DialogEffectSpec {
  return defaultEffect(kind, foreground, background, backgroundPixel, indices);
}

export function updateDialogEffectColor(
  spec: DialogEffectSpec,
  key: "from" | "to" | "color" | "bgColor",
  color: DialogColor,
): DialogEffectSpec {
  return updateEffectColor(spec, key, color);
}

export function getDialogEffectChannels(
  spec: DialogEffectSpec,
  backgroundLayer: boolean,
  depth: 8 | 16 | 32,
): number {
  return effectChannels(spec, backgroundLayer, depth);
}

interface EffectDialogView {
  target: DialogEditorTarget;
  canOpen: boolean;
  depth: 8 | 16 | 32;
  foreground: DialogColor;
  background: DialogColor;
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  outlineBackgroundIndex?: number | null;
  backgroundLayer: boolean;
  backgroundPixel?: DialogColor;
  tiledMode: 0 | 1 | 2 | 3;
}

export function useEffectDialogManager() {
  const source = useDialogEditorSource();
  useEffect(() => () => source.core?.imageEditing.previewEffect(null), [source.core]);
  const snapshot = source.snapshot;
  const document = snapshot?.document;
  const timeline = document?.timeline;
  const layer = timeline?.layers[timeline.activeLayer];
  const backgroundLayer = !!layer && isBackgroundLayer(layer);
  const depth: 8 | 16 | 32 = timeline?.colorDepth ?? 32;
  const color: DialogColor = [0, 0, 0, 255];
  const current: EffectDialogView | null = source.target
    ? {
        target: source.target,
        canOpen: !!document && canOpenEffect(document),
        depth,
        foreground: snapshot?.settings.foreground ?? color,
        background: snapshot?.settings.background ?? color,
        foregroundIndex: snapshot?.settings.foregroundIndex,
        backgroundIndex: snapshot?.settings.backgroundIndex,
        outlineBackgroundIndex:
          depth === 8
            ? backgroundLayer
              ? timeline?.frames[timeline.activeFrame]?.cels[timeline.activeLayer]?.asepriteSamples
                  ?.data[0]
              : (timeline?.transparentIndex ?? 0)
            : undefined,
        backgroundLayer,
        tiledMode: snapshot?.view.tiledMode ?? 0,
        backgroundPixel:
          backgroundLayer && document
            ? (Array.from(document.layer.pixels.data.subarray(0, 4)) as unknown as DialogColor)
            : undefined,
      }
    : null;

  return {
    current,
    isCurrentTarget: source.isCurrentTarget,
    begin(target: DialogEditorTarget): boolean {
      if (!source.core || !source.isCurrentTarget(target)) return false;
      return source.core.imageEditing.beginEffect();
    },
    open(_kind: DialogEffectKind): DialogEditorTarget | null {
      if (!source.core || !current?.canOpen || !source.core.imageEditing.beginEffect()) return null;
      return current.target;
    },
    clearPreview(target: DialogEditorTarget | null): void {
      if (target && source.isCurrentTarget(target)) source.core?.imageEditing.previewEffect(null);
    },
    preview(target: DialogEditorTarget, spec: DialogEffectSpec | null): boolean {
      if (!source.core || !source.isCurrentTarget(target)) return false;
      source.core.imageEditing.previewEffect(spec);
      return true;
    },
    apply(
      target: DialogEditorTarget,
      spec: DialogEffectSpec,
      effectTarget: DialogEffectTarget,
    ): boolean {
      if (!source.core || !source.isCurrentTarget(target)) return false;
      source.core.imageEditing.previewEffect(null);
      source.core.imageEditing.applyEffect(spec, effectTarget);
      return true;
    },
    canOpenCurrent(): boolean {
      const live = source.core?.getSnapshot().document;
      return !!source.core && canOpenEffect(live ?? null);
    },
  };
}
