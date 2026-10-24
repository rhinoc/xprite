import { useState, type ReactNode } from "react";

import type { PaletteTranslate } from "$/palette/model";
import {
  ALGORITHM_LABELS,
  DITHER_LABELS,
  LABELS,
  LINE_GUIDE_LABELS,
  PICKER_LABELS,
  PREPASS_LABELS,
  type PixelationLabel as Label,
} from "$/pixelation/base-labels";
import {
  PixelationPaletteMenu,
  PixelationPaletteSwatches,
  type PixelationPaletteResources,
} from "$/pixelation/palette-control";
import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PIXELATION_SIZES,
  PixelationAlgorithm,
  PixelationDither,
  getAllColorPickers,
  getListedAlgorithms,
  pixelationSizeFromAxis,
  type PixelGridAnalysis,
  type PixelationSettings,
  type PixelationSize,
} from "@xprite/editor-core/import-export";
import { Checkbox, Combobox, Input, type ControlPlacement } from "@xprite/ui";

const NUMBER_WIDTH = 36;
const MAX_COLORS = 256;
const MIN_COLORS = 2;
const FIELD_WIDTH = 112;

/** The base controls every pixelation surface (import dialog, pixelate tool, beads tool) shares. */
export enum PixelationSlot {
  Algorithm = "algorithm",
  Width = "width",
  Height = "height",
  ColorPicker = "color-picker",
  LimitColors = "limit-colors",
  Colors = "colors",
  /** Only when Limit colors is on. */
  Dither = "dither",
  /** The palette swatches (the loaded preset, else the automatic palette). */
  Palette = "palette",
  /** The palette preset menu button; tool pages put it right after the colour count. */
  PaletteMenu = "palette-menu",
  /** Outline pre-pass: None / PixelOE / PixelOE + lines. */
  Prepass = "prepass",
  /** Only for the PixelOE + lines pre-pass. */
  LineGuide = "line-guide",
}

export interface PixelationBaseProps {
  settings: Readonly<PixelationSettings>;
  /** The algorithm the grid came from. */
  algorithm: PixelationAlgorithm;
  /** The grid that algorithm found; the colour rule and the shown size follow it. */
  grid?: PixelGridAnalysis;
  sourceSize: { width: number; height: number };
  /** Loading or exporting: every control is disabled. */
  busy?: boolean;
  /** Controls a surface does not use (the dialog has no palette browser, beads map to a brand). */
  hidden?: ReadonlySet<PixelationSlot>;
  paletteResources?: PixelationPaletteResources;
  translate: PaletteTranslate;
  onChange(patch: Partial<PixelationSettings>): void;
  onAlgorithm(algorithm: PixelationAlgorithm, size?: PixelationSize): void;
}

export interface PixelationSlotView {
  visible: boolean;
  /** Translated label for slots that sit beside text; null for self-labelled ones. */
  label: string | null;
  /** `pixelWidth` only matters in flow layout; absolute placements carry their own bounds. */
  render(placement?: ControlPlacement, pixelWidth?: number): ReactNode;
}

/**
 * The base controls as one config: which slots show, what they say and do, and when they are
 * disabled. A surface only decides where each one goes: flow layout (`PixelationBaseControls`) or
 * its own absolute rows (the editor import dialog).
 */
export function usePixelationBase(
  props: PixelationBaseProps,
): Record<PixelationSlot, PixelationSlotView> {
  const { settings, algorithm, grid, sourceSize, busy = false, hidden, translate } = props;
  const { onChange, onAlgorithm } = props;
  const [drafts, setDrafts] = useState<{ width?: string; height?: string }>({});
  const t = (label: Label) => translate(label.text);
  const show = (slot: PixelationSlot, visible = true) => visible && !hidden?.has(slot);
  /** The size the chosen method produces: its grid's cell count, or the plain target if it found none. */
  const outputSize = grid?.reliable
    ? { width: grid.width, height: grid.height }
    : { width: settings.targetWidth, height: settings.targetHeight };
  const commitSize = (axis: "width" | "height", value: string) => {
    setDrafts((previous) => ({ ...previous, [axis]: undefined }));
    const size = pixelationSizeFromAxis(axis, value, sourceSize);
    if (size) onAlgorithm(PixelationAlgorithm.CustomSize, size);
  };
  const sizeOptions = PIXELATION_SIZES.map((preset) => ({
    value: String(preset),
    label: translate(LABELS.pixels.text, { size: preset }),
  }));
  const size = (axis: "width" | "height", label: Label): PixelationSlotView => ({
    visible: show(axis === "width" ? PixelationSlot.Width : PixelationSlot.Height),
    label: t(label),
    render: (placement, pixelWidth) => (
      <Combobox
        pixelWidth={pixelWidth}
        {...placement}
        aria-label={translate(axis === "width" ? "Width" : "Height")}
        editable
        inputMode="numeric"
        suffix="px"
        value={drafts[axis] ?? String(outputSize[axis])}
        disabled={busy}
        options={sizeOptions}
        onDraftValueChange={(value) => setDrafts((previous) => ({ ...previous, [axis]: value }))}
        onValueChange={(value) => commitSize(axis, value)}
      />
    ),
  });
  const limited = settings.reduceColors;
  return {
    [PixelationSlot.Algorithm]: {
      visible: show(PixelationSlot.Algorithm),
      label: t(LABELS.algorithm),
      render: (placement) => (
        <Combobox
          pixelWidth={FIELD_WIDTH}
          {...placement}
          aria-label={t(LABELS.algorithm)}
          value={algorithm}
          disabled={busy}
          options={getListedAlgorithms().map((id) => ({
            value: id,
            label: t(ALGORITHM_LABELS[id]),
          }))}
          onValueChange={(value) => onAlgorithm(value as PixelationAlgorithm)}
        />
      ),
    },
    [PixelationSlot.Width]: size("width", LABELS.width),
    [PixelationSlot.Height]: size("height", LABELS.height),
    [PixelationSlot.ColorPicker]: {
      visible: show(PixelationSlot.ColorPicker),
      label: t(LABELS.picker),
      render: (placement) => (
        <Combobox
          pixelWidth={FIELD_WIDTH}
          {...placement}
          aria-label={t(LABELS.picker)}
          value={settings.colorPicker}
          // Without a grid and without a pre-pass the preview is a plain resize, which has no
          // per-cell colour to pick; a pre-pass hands its result to the picker block by block.
          disabled={busy || (!grid?.reliable && settings.prepass === OutlinePrepass.None)}
          options={getAllColorPickers().map((id) => ({ value: id, label: t(PICKER_LABELS[id]) }))}
          onValueChange={(value) => onChange({ colorPicker: value as CellColorPicker })}
        />
      ),
    },
    [PixelationSlot.LimitColors]: {
      visible: show(PixelationSlot.LimitColors),
      label: null,
      render: (placement) => (
        <Checkbox
          {...placement}
          label={t(LABELS.limitColors)}
          checked={limited}
          disabled={busy}
          onCheckedChange={(reduceColors) => onChange({ reduceColors })}
        />
      ),
    },
    [PixelationSlot.Colors]: {
      visible: show(PixelationSlot.Colors, limited && settings.palette === null),
      label: t(LABELS.colors),
      render: (placement) => (
        <Input
          pixelWidth={NUMBER_WIDTH}
          {...placement}
          aria-label={translate("Colors")}
          inputMode="numeric"
          value={String(settings.maxColors)}
          min={MIN_COLORS}
          max={MAX_COLORS}
          step={1}
          disabled={busy || !limited}
          onCommit={(value) => onChange({ maxColors: Number(value) })}
        />
      ),
    },
    [PixelationSlot.Palette]: {
      visible: show(PixelationSlot.Palette, limited && !!props.paletteResources),
      label: null,
      render: () =>
        props.paletteResources && (
          <PixelationPaletteSwatches
            settings={settings}
            resources={props.paletteResources}
            translate={translate}
          />
        ),
    },
    [PixelationSlot.PaletteMenu]: {
      visible: show(PixelationSlot.PaletteMenu, limited && !!props.paletteResources),
      label: null,
      render: () =>
        props.paletteResources && (
          <PixelationPaletteMenu
            settings={settings}
            resources={props.paletteResources}
            disabled={busy}
            translate={translate}
            onChange={onChange}
          />
        ),
    },
    [PixelationSlot.Dither]: {
      visible: show(PixelationSlot.Dither, limited),
      label: t(LABELS.dither),
      render: (placement, pixelWidth) => (
        <Combobox
          pixelWidth={pixelWidth ?? FIELD_WIDTH}
          {...placement}
          aria-label={t(LABELS.dither)}
          value={settings.dither}
          disabled={busy || !limited}
          options={Object.values(PixelationDither).map((id) => ({
            value: id,
            label: t(DITHER_LABELS[id]),
          }))}
          onValueChange={(value) => onChange({ dither: value as PixelationDither })}
        />
      ),
    },
    [PixelationSlot.Prepass]: {
      visible: show(PixelationSlot.Prepass),
      label: t(LABELS.prepass),
      render: (placement, pixelWidth) => (
        <Combobox
          pixelWidth={pixelWidth ?? FIELD_WIDTH}
          {...placement}
          aria-label={t(LABELS.prepass)}
          value={settings.prepass}
          disabled={busy}
          options={Object.values(OutlinePrepass).map((id) => ({
            value: id,
            label: t(PREPASS_LABELS[id]),
          }))}
          onValueChange={(value) => onChange({ prepass: value as OutlinePrepass })}
        />
      ),
    },
    [PixelationSlot.LineGuide]: {
      visible: show(PixelationSlot.LineGuide, settings.prepass === OutlinePrepass.PixeloeLines),
      label: t(LABELS.lineGuide),
      render: (placement, pixelWidth) => (
        <Combobox
          pixelWidth={pixelWidth ?? FIELD_WIDTH}
          {...placement}
          aria-label={t(LABELS.lineGuide)}
          value={settings.lineGuide}
          disabled={busy}
          options={Object.values(LineGuideMode).map((id) => ({
            value: id,
            label: t(LINE_GUIDE_LABELS[id]),
          }))}
          onValueChange={(value) => onChange({ lineGuide: value as LineGuideMode })}
        />
      ),
    },
  };
}
