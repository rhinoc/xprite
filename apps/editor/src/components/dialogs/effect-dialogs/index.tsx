import { useEffect, useRef, useState } from "react";

import { CurvePointDialog } from "$/components/dialogs/effect-dialogs/curve-point-dialog";
import { EditorFilterWindow } from "$/components/dialogs/filter-window";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUi, tUiSource } from "$/i18n";
import {
  createDialogEffect,
  updateDialogEffectColor,
  getDialogEffectChannels,
  DIALOG_OUTLINE_MATRICES,
  DialogEffectKind,
  DialogHueSaturationMode,
  DialogEffectTarget,
  type DialogEffectSpec,
  type DialogColor,
  MAX_DIALOG_MEDIAN_SIZE,
  DIALOG_CONVOLUTION_PRESETS,
  dialogConvolutionKernel,
  updateDialogCurvePoint,
} from "$/managers/dialogs/effect-dialog-manager";
import { useEffectDialogPreferences } from "$/managers/preferences/use-effect-dialog-preferences";
import {
  formatEditorColor,
  parseEditorColor,
  TOOL_COLOR_CHANNEL_MAX,
} from "$/managers/tools/color-control";
import { Button, Input, Combobox, CurveEditor, Text, TextVariant, Slider } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";

const COLOR_CURVE_BODY_WIDTH = 256;

const titles: Record<DialogEffectKind, string> = {
  [DialogEffectKind.ReplaceColor]: "Replace Color",
  [DialogEffectKind.HueSaturation]: "Hue/Saturation",
  [DialogEffectKind.BrightnessContrast]: "Brightness/Contrast",
  [DialogEffectKind.Invert]: "Invert Color",
  [DialogEffectKind.Outline]: "Outline",
  [DialogEffectKind.MedianBlur]: "Median Blur",
  [DialogEffectKind.ConvolutionMatrix]: "Convolution Matrix",
  [DialogEffectKind.ColorCurve]: "Color Curve",
};
const widths: Record<DialogEffectKind, number> = {
  [DialogEffectKind.ReplaceColor]: 188,
  [DialogEffectKind.HueSaturation]: 366,
  [DialogEffectKind.BrightnessContrast]: 336,
  [DialogEffectKind.Invert]: 0,
  [DialogEffectKind.Outline]: 292,
  [DialogEffectKind.MedianBlur]: 240,
  [DialogEffectKind.ConvolutionMatrix]: 300,
  [DialogEffectKind.ColorCurve]: COLOR_CURVE_BODY_WIDTH,
};
export interface EffectDialogsProps {
  kind: DialogEffectKind;
  depth?: 8 | 16 | 32;
  foreground: DialogColor;
  background: DialogColor;
  backgroundLayer?: boolean;
  backgroundPixel?: DialogColor;
  tiledMode?: 0 | 1 | 2 | 3;
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  outlineBackgroundIndex?: number | null;
  onClose: () => void;
  onApply: (spec: DialogEffectSpec, target: DialogEffectTarget) => void;
  onPreview: (spec: DialogEffectSpec | null) => void;
}
/** Actual Aseprite FilterWindow controls; the scene host only binds core actions. */
export function EffectDialogs({
  kind,
  depth = 32,
  foreground,
  background,
  backgroundLayer = false,
  backgroundPixel,
  tiledMode = 0,
  foregroundIndex,
  backgroundIndex,
  outlineBackgroundIndex,
  onClose,
  onApply,
  onPreview,
}: EffectDialogsProps) {
  const preferences = useEffectDialogPreferences();
  const [spec, setSpec] = useState<DialogEffectSpec>(() => {
      const initial = preferences.initial(
        createDialogEffect(kind, foreground, background, backgroundPixel, {
          foregroundIndex,
          backgroundIndex,
          outlineBackgroundIndex,
        }),
      );
      return initial.kind === DialogEffectKind.MedianBlur ||
        initial.kind === DialogEffectKind.ConvolutionMatrix
        ? { ...initial, tiledMode }
        : initial;
    }),
    [target, setTarget] = useState<DialogEffectTarget>(preferences.target),
    [preview, setPreview] = useState(preferences.preview[kind] ?? true),
    [applied, setApplied] = useState(0);
  const [picker, setPicker] = useState<{
      key: "from" | "to" | "color" | "bgColor";
      bounds: SurfaceBounds;
    } | null>(null),
    previewRef = useRef(onPreview);
  const [curvePoint, setCurvePoint] = useState(0);
  const [pointEditor, setPointEditor] = useState<number | null>(null);
  const tiled =
    spec.kind === DialogEffectKind.Outline ||
    spec.kind === DialogEffectKind.MedianBlur ||
    spec.kind === DialogEffectKind.ConvolutionMatrix;
  previewRef.current = onPreview;
  useEffect(() => {
    previewRef.current(preview ? spec : null);
    return () => previewRef.current(null);
  }, [spec, preview, applied]);
  useEffect(() => {
    preferences.remember(target, kind, preview, spec);
  }, [target, preview, kind, spec, preferences]);
  const patch = (values: Partial<DialogEffectSpec>) =>
    setSpec((old) => ({ ...old, ...values }) as DialogEffectSpec);
  const apply = () => {
    previewRef.current(null);
    onApply(spec, target);
    setApplied((n) => n + 1);
  };
  const accept = () => {
    preferences.accepted(spec);
    previewRef.current(null);
    onApply(spec, target);
    onClose();
  };
  const close = () => {
    previewRef.current(null);
    onClose();
  };
  const pickerColor =
    picker &&
    (spec.kind === DialogEffectKind.ReplaceColor || spec.kind === DialogEffectKind.Outline)
      ? (spec as unknown as Record<string, DialogColor>)[picker.key]
      : foreground;
  const swatch = (
    c: SurfaceBounds,
    key: "from" | "to" | "color" | "bgColor",
    label: string,
    x: number,
    y: number,
  ) => {
    const value = (spec as unknown as Record<string, DialogColor>)[key];
    const b = { x: c.x + x, y: c.y + y, width: 128, height: 30 };
    const index =
      spec[
        key === "from"
          ? "fromIndex"
          : key === "to"
            ? "toIndex"
            : key === "color"
              ? "colorIndex"
              : "bgIndex"
      ];
    const caption =
      index !== undefined && (key !== "bgColor" || backgroundLayer)
        ? tUi("ui.idx", { value1: index })
        : undefined;
    return (
      <EditorColorButton
        bounds={b}
        relativeTo={c}
        value={formatEditorColor(value)}
        text={caption}
        mask={value[3] === 0}
        aria-label={label}
        onClick={() => setPicker({ key, bounds: b })}
      />
    );
  };
  const pair = (
    c: SurfaceBounds,
    key: "brightness" | "contrast" | "hue" | "saturation" | "lightness" | "alpha",
    label: string,
    x: number,
    y: number,
    width: number,
    entryX: number,
    entryWidth: number,
    min: number,
    max: number,
  ) => {
    const value = (spec as unknown as Record<string, number>)[key];
    return (
      <>
        <Slider
          bounds={{ x: c.x + x, y: c.y + y, width, height: 30 }}
          relativeTo={c}
          min={min}
          max={max}
          value={value}
          aria-label={label}
          onValueChange={(v) => patch({ [key]: v })}
        />
        <Input
          mini
          bounds={{ x: c.x + entryX, y: c.y + y, width: entryWidth, height: 30 }}
          relativeTo={c}
          value={String(value)}
          inputMode="numeric"
          aria-label={tUi("ui.value.2", { value1: tUiSource(label) })}
          onValueChange={(v) => {
            if (v.trim() && Number.isFinite(Number(v)))
              patch({ [key]: Math.max(min, Math.min(max, Math.trunc(Number(v)))) });
          }}
        />
      </>
    );
  };
  return (
    <>
      <EditorFilterWindow
        title={titles[kind]}
        depth={depth}
        bodyWidth={widths[kind]}
        bodyHeight={tiled ? 264 : 212}
        channels={getDialogEffectChannels(spec, backgroundLayer, depth)}
        alphaEnabled={!backgroundLayer}
        target={target}
        preview={preview}
        tiled={tiled && "tiledMode" in spec ? !!spec.tiledMode : undefined}
        onChannels={(channels) => patch({ channels })}
        onTarget={setTarget}
        onPreview={setPreview}
        onTiled={(value) => patch({ tiledMode: value ? 3 : 0 })}
        onApply={apply}
        onAccept={accept}
        onCancel={close}
      >
        {(c) => (
          <>
            {spec.kind === DialogEffectKind.MedianBlur && (
              <>
                {(["width", "height"] as const).map((dimension, index) => (
                  <span key={dimension}>
                    <Text
                      variant={TextVariant.Control}
                      bounds={{ x: c.x, y: c.y + index * 52, width: 110, height: 30 }}
                      relativeTo={c}
                      text={dimension === "width" ? "Width:" : "Height:"}
                    />
                    <Input
                      mini
                      bounds={{ x: c.x + 116, y: c.y + index * 52, width: 110, height: 30 }}
                      relativeTo={c}
                      value={String(spec[dimension])}
                      inputMode="numeric"
                      aria-label={tUiSource(
                        dimension === "width" ? "Median width" : "Median height",
                      )}
                      onValueChange={(value) => {
                        if (value.trim() && Number.isFinite(Number(value)))
                          patch({
                            [dimension]: Math.max(
                              1,
                              Math.min(MAX_DIALOG_MEDIAN_SIZE, Math.round(Number(value))),
                            ),
                          });
                      }}
                    />
                  </span>
                ))}
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x, y: c.y + 120, width: c.width, height: 38 }}
                  relativeTo={c}
                  text={tUi("ui.median.neighborhood.range", { max: MAX_DIALOG_MEDIAN_SIZE })}
                />
              </>
            )}
            {spec.kind === DialogEffectKind.ConvolutionMatrix &&
              (() => {
                const kernel = dialogConvolutionKernel(spec);
                return (
                  <>
                    <Text
                      variant={TextVariant.Control}
                      bounds={{ x: c.x, y: c.y, width: c.width, height: 24 }}
                      relativeTo={c}
                      text="Matrix:"
                    />
                    <Combobox
                      bounds={{ x: c.x, y: c.y + 30, width: c.width, height: 30 }}
                      relativeTo={c}
                      aria-label={tUiSource("Convolution preset")}
                      value={spec.preset}
                      options={DIALOG_CONVOLUTION_PRESETS.map((preset) => ({ ...preset }))}
                      onValueChange={(value) => {
                        const preset = DIALOG_CONVOLUTION_PRESETS.find(
                          (entry) => entry.value === value,
                        )?.value;
                        if (preset)
                          patch({
                            preset,
                            channels: getDialogEffectChannels(
                              { ...spec, preset, channels: undefined },
                              backgroundLayer,
                              depth,
                            ),
                          });
                      }}
                    />
                    {kernel.weights.map((weight, index) => (
                      <Text
                        variant={TextVariant.Control}
                        key={index}
                        bounds={{
                          x: c.x + (index % kernel.width) * 70,
                          y: c.y + 82 + Math.floor(index / kernel.width) * 36,
                          width: 64,
                          height: 30,
                        }}
                        relativeTo={c}
                        text={String(weight)}
                      />
                    ))}
                    <Text
                      variant={TextVariant.Control}
                      bounds={{ x: c.x, y: c.y + 214, width: c.width, height: 30 }}
                      relativeTo={c}
                      text={tUi("ui.convolution.parameters", {
                        divisor: kernel.divisor,
                        bias: kernel.bias,
                      })}
                    />
                  </>
                );
              })()}
            {spec.kind === DialogEffectKind.ColorCurve && (
              <CurveEditor
                bounds={c}
                relativeTo={c}
                points={spec.points}
                selectedIndex={Math.min(curvePoint, spec.points.length - 1)}
                onSelectionChange={setCurvePoint}
                onPointsChange={(points) => patch({ points })}
                onPointEdit={setPointEditor}
                min={0}
                max={TOOL_COLOR_CHANNEL_MAX}
                step={1}
                aria-label={tUi("ui.color.curve.editor")}
              />
            )}
            {spec.kind === DialogEffectKind.ReplaceColor && (
              <>
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y, width: 50, height: 30 }}
                  relativeTo={c}
                  text="From:"
                />
                {swatch(c, "from", "From color", 60, 0)}
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y + 38, width: 50, height: 30 }}
                  relativeTo={c}
                  text="To:"
                />
                {swatch(c, "to", "To color", 60, 38)}
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y + c.height - 58, width: 186, height: 18 }}
                  relativeTo={c}
                  text="Tolerance:"
                />
                <Slider
                  bounds={{ x: c.x, y: c.y + c.height - 32, width: 188, height: 32 }}
                  relativeTo={c}
                  min={0}
                  max={TOOL_COLOR_CHANNEL_MAX}
                  value={spec.tolerance}
                  aria-label="Tolerance"
                  onValueChange={(v) => patch({ tolerance: v })}
                />
              </>
            )}
            {spec.kind === DialogEffectKind.BrightnessContrast && (
              <>
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y, width: 334, height: 18 }}
                  relativeTo={c}
                  text="Brightness:"
                />
                {pair(c, "brightness", "Brightness", 0, 26, 256, 264, 72, -100, 100)}
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y + 64, width: 334, height: 18 }}
                  relativeTo={c}
                  text="Contrast:"
                />
                {pair(c, "contrast", "Contrast", 0, 90, 256, 264, 72, -100, 100)}
              </>
            )}
            {spec.kind === DialogEffectKind.HueSaturation && (
              <>
                {(
                  [
                    DialogHueSaturationMode.HsvMul,
                    DialogHueSaturationMode.HslMul,
                    DialogHueSaturationMode.HsvAdd,
                    DialogHueSaturationMode.HslAdd,
                  ] as DialogHueSaturationMode[]
                ).map((mode, i) => (
                  <Button
                    key={mode}
                    bounds={{
                      x: c.x + (i % 2) * 182,
                      y: c.y + Math.floor(i / 2) * 24,
                      width: i % 2 ? 184 : 184,
                      height: 30,
                    }}
                    relativeTo={c}
                    text={["HSV", "HSL", "HSV+", "HSL+"][i]}
                    font="mini"
                    selected={spec.mode === mode}
                    aria-label={mode}
                    onClick={() => patch({ mode })}
                  />
                ))}
                {(["hue", "saturation", "lightness", "alpha"] as const).map((key, i) => (
                  <span key={key}>
                    <Text
                      variant={TextVariant.Control}
                      bounds={{ x: c.x + 2, y: c.y + 68 + i * 30, width: 12, height: 18 }}
                      relativeTo={c}
                      text={["H", "S", spec.mode.startsWith("hsl") ? "L" : "V", "A"][i]}
                    />
                    {pair(
                      c,
                      key,
                      [
                        "Hue",
                        "Saturation",
                        spec.mode.startsWith("hsl") ? "Lightness" : "Value",
                        "Alpha",
                      ][i],
                      14,
                      62 + i * 30,
                      256,
                      270,
                      96,
                      key === "hue" ? -180 : -100,
                      key === "hue" ? 180 : 100,
                    )}
                  </span>
                ))}
              </>
            )}
            {spec.kind === DialogEffectKind.Outline && (
              <>
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y, width: 154, height: 30 }}
                  relativeTo={c}
                  text="Outline Color:"
                />
                {swatch(c, "color", "Outline color", 164, 0)}
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x + 2, y: c.y + 38, width: 154, height: 30 }}
                  relativeTo={c}
                  text="Background Color:"
                />
                {swatch(c, "bgColor", "Background color", 164, 38)}
                {(["circle", "square", "horizontal", "vertical"] as const).map((name, i) => (
                  <Button
                    key={name}
                    bounds={{
                      x: c.x + (i % 2) * 36,
                      y: c.y + 76 + Math.floor(i / 2) * 36,
                      width: i % 2 ? 38 : 38,
                      height: 42,
                    }}
                    relativeTo={c}
                    icon={`outline_${name}`}
                    selected={spec.matrix === DIALOG_OUTLINE_MATRICES[name]}
                    aria-label={tUi("ui.outline.2", { value1: tUiSource(name) })}
                    onClick={() => patch({ matrix: DIALOG_OUTLINE_MATRICES[name] })}
                  />
                ))}
                {Array.from({ length: 9 }, (_, i) => (
                  <Button
                    key={i}
                    bounds={{
                      x: c.x + (i % 3) * 32,
                      y: c.y + 162 + Math.floor(i / 3) * 32,
                      width: i % 3 === 2 ? 34 : 34,
                      height: 38,
                    }}
                    relativeTo={c}
                    icon={
                      spec.matrix & (1 << (8 - i)) ? "outline_full_pixel" : "outline_empty_pixel"
                    }
                    aria-label={tUi("ui.outline.neighbor", { value1: i + 1 })}
                    onClick={() => patch({ matrix: spec.matrix ^ (1 << (8 - i)) })}
                  />
                ))}
                {(["outside", "inside"] as const).map((place, i) => (
                  <Button
                    key={place}
                    bounds={{ x: c.x + 106, y: c.y + 76 + i * 24, width: 68, height: 30 }}
                    relativeTo={c}
                    text={place === "outside" ? "Outside" : "Inside"}
                    font="mini"
                    selected={spec.place === place}
                    aria-label={tUi("ui.outline.2", { value1: tUiSource(place) })}
                    onClick={() => patch({ place })}
                  />
                ))}
              </>
            )}
          </>
        )}
      </EditorFilterWindow>
      {spec.kind === DialogEffectKind.ColorCurve &&
        pointEditor !== null &&
        spec.points[pointEditor] && (
          <CurvePointDialog
            point={spec.points[pointEditor]}
            canDelete={spec.points.length > 1}
            onClose={() => setPointEditor(null)}
            onAccept={(point) => {
              setSpec((old) => {
                if (old.kind !== DialogEffectKind.ColorCurve) return old;
                const updated = updateDialogCurvePoint(old, pointEditor, "x", point.x);
                return updated.kind === DialogEffectKind.ColorCurve
                  ? updateDialogCurvePoint(updated, pointEditor, "y", point.y)
                  : updated;
              });
              setPointEditor(null);
            }}
            onDelete={() => {
              setSpec((old) =>
                old.kind === DialogEffectKind.ColorCurve && old.points.length > 1
                  ? { ...old, points: old.points.filter((_, index) => index !== pointEditor) }
                  : old,
              );
              setCurvePoint(Math.max(0, pointEditor - 1));
              setPointEditor(null);
            }}
          />
        )}
      <ColorPicker
        open={!!picker}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        value={formatEditorColor(pickerColor ?? foreground)}
        onValueChange={(v) => {
          if (picker)
            setSpec((old) => updateDialogEffectColor(old, picker.key, parseEditorColor(v)));
        }}
        anchor={picker?.bounds}
      />
    </>
  );
}
