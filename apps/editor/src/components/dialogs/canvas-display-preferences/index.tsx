import { useEffect, useState } from "react";

import {
  PreferencesLabel,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUiSource, tUi } from "$/i18n";
import {
  CanvasDisplaySection,
  CheckerboardSize,
  type CanvasDisplayColorKey,
  type CanvasDisplayPreferences,
} from "$/managers/preferences/canvas-display-preferences";
import { CanvasDisplayPreferenceTarget } from "$/managers/preferences/document-preferences";
import {
  parseGridBoundsPreference,
  type GridBoundsPreferences,
} from "$/managers/preferences/grid-preferences";
import { Button, Combobox, Divider, Input, Slider, type SurfaceBounds } from "@xprite/ui";

const MAX_CHECKERBOARD_CELL_SIZE = 512;
const MAX_OPACITY = 255;
const NARROW_SCOPE_CONTENT_OFFSET = 16;
const GRID_BOUNDS_LAYOUT = [
  { key: "x", label: "X:", accessibleLabel: "Grid X", x: 358, y: 145, inputX: 398 },
  { key: "y", label: "Y:", accessibleLabel: "Grid Y", x: 464, y: 145, inputX: 504 },
  { key: "width", label: "Width:", accessibleLabel: "Grid Width", x: 358, y: 165, inputX: 398 },
  { key: "height", label: "Height:", accessibleLabel: "Grid Height", x: 464, y: 165, inputX: 504 },
] as const;
const GRID_BOUNDS_CONTENT_HEIGHT = 40;
const GRID_BOUNDS_INPUT_WIDTH = 58;

function GridBoundsEntry({
  label,
  accessibleLabel,
  labelBounds,
  inputBounds,
  client,
  field,
  value,
  enabled,
  onChange,
}: {
  label: string;
  accessibleLabel: string;
  labelBounds: SurfaceBounds;
  inputBounds: SurfaceBounds;
  client: SurfaceBounds;
  field: keyof GridBoundsPreferences;
  value: number;
  enabled: boolean;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <>
      <PreferencesLabel text={label} bounds={labelBounds} relativeTo={client} />
      <Input
        aria-label={accessibleLabel}
        bounds={inputBounds}
        relativeTo={client}
        value={text}
        disabled={!enabled}
        inputMode="numeric"
        onValueChange={(next) => {
          setText(next);
          const parsed = parseGridBoundsPreference(next, field);
          if (parsed !== null) onChange(parsed);
        }}
        onCommit={(next) => {
          const parsed = parseGridBoundsPreference(next, field) ?? value;
          setText(String(parsed));
          onChange(parsed);
        }}
      />
    </>
  );
}
const CHECKERBOARD_SIZES = [
  CheckerboardSize.Size16,
  CheckerboardSize.Size8,
  CheckerboardSize.Size4,
  CheckerboardSize.Size2,
  CheckerboardSize.Size1,
  CheckerboardSize.Custom,
];

export function CanvasDisplayPreferencesSection({
  box: layoutBox,
  client,
  section,
  value,
  gridBounds,
  gridBoundsEnabled,
  onGridBoundsChange,
  target,
  hasActiveDocument,
  enabled,
  showScope,
  onChange,
  onTargetChange,
  onColorClick,
  onReset,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  section: CanvasDisplaySection;
  value: CanvasDisplayPreferences;
  gridBounds: GridBoundsPreferences;
  gridBoundsEnabled: boolean;
  onGridBoundsChange: (patch: Partial<GridBoundsPreferences>) => void;
  target: CanvasDisplayPreferenceTarget;
  hasActiveDocument: boolean;
  enabled: boolean;
  showScope: boolean;
  onChange: (patch: Partial<CanvasDisplayPreferences>) => void;
  onTargetChange: (target: CanvasDisplayPreferenceTarget) => void;
  onColorClick: (key: CanvasDisplayColorKey, title: string, anchor: SurfaceBounds) => void;
  onReset: () => void;
}) {
  const narrow = usePreferencesDialogNarrowLayout();
  const [resetVersion, setResetVersion] = useState(0);
  const box = (x: number, y: number, width: number, height: number) =>
    layoutBox(x, y + (narrow ? NARROW_SCOPE_CONTENT_OFFSET : 0), width, height);
  const background = section === CanvasDisplaySection.Background;
  const label = (text: string, x: number, y: number, width: number, height = 16) => (
    <PreferencesLabel bounds={box(x, y, width, height)} relativeTo={client} text={text} />
  );
  const color = (
    key: CanvasDisplayColorKey,
    title: string,
    x: number,
    y: number,
    width: number,
  ) => {
    const bounds = box(x, y, width, 18);
    return (
      <EditorColorButton
        aria-label={title}
        bounds={bounds}
        relativeTo={client}
        value={value[key]}
        disabled={!enabled}
        onClick={() => onColorClick(key, title, bounds)}
      />
    );
  };
  const custom = value.checkerboardSize === CheckerboardSize.Custom;
  const dimension = (
    key: "checkerboardCustomWidth" | "checkerboardCustomHeight",
    title: string,
    x: number,
    y: number,
    width: number,
  ) => (
    <Input
      aria-label={title}
      bounds={box(x, y, width, 16)}
      relativeTo={client}
      inputMode="numeric"
      value={String(value[key])}
      disabled={!enabled}
      onValueChange={(text) => {
        const size = Number(text);
        if (
          text.trim() &&
          Number.isInteger(size) &&
          size >= 1 &&
          size <= MAX_CHECKERBOARD_CELL_SIZE
        )
          onChange({ [key]: size });
      }}
      onCommit={(text) => {
        const size = Number(text);
        onChange({
          [key]: Number.isFinite(size)
            ? Math.max(1, Math.min(MAX_CHECKERBOARD_CELL_SIZE, Math.trunc(size)))
            : value[key],
        });
      }}
    />
  );
  const gridGroup = (pixel: boolean, y: number) => {
    const boundsHeight = pixel ? 0 : GRID_BOUNDS_CONTENT_HEIGHT;
    const colorKey = pixel ? "pixelGridColor" : "gridColor";
    const opacityKey = pixel ? "pixelGridOpacity" : "gridOpacity";
    const autoKey = pixel ? "pixelGridAutoOpacity" : "gridAutoOpacity";
    const colorTitle = pixel ? "Pixel grid color" : "Grid color";
    const opacityTitle = pixel ? "Pixel grid opacity" : "Grid opacity";
    return (
      <>
        <Divider
          bounds={box(358, y, 333, 11)}
          relativeTo={client}
          text={pixel ? "Pixel Grid" : "Grid"}
        />
        {!pixel &&
          GRID_BOUNDS_LAYOUT.map((field, index) => {
            const x = narrow ? 358 + (index % 2) * 160 : field.x;
            return (
              <GridBoundsEntry
                key={`${target}-${field.key}-${resetVersion}`}
                label={field.label}
                accessibleLabel={field.accessibleLabel}
                labelBounds={box(x, field.y, narrow ? 64 : 40, 16)}
                inputBounds={box(
                  narrow ? x + 64 : field.inputX,
                  field.y,
                  narrow ? 80 : GRID_BOUNDS_INPUT_WIDTH,
                  16,
                )}
                client={client}
                field={field.key}
                value={gridBounds[field.key]}
                enabled={gridBoundsEnabled}
                onChange={(next) => onGridBoundsChange({ [field.key]: next })}
              />
            );
          })}
        {label("Color:", 358, y + 19 + boundsHeight, narrow ? 333 : 60)}
        {color(
          colorKey,
          colorTitle,
          narrow ? 358 : 398,
          y + (narrow ? 38 : 19) + boundsHeight,
          narrow ? 333 : 166,
        )}
        {label("Opacity:", 358, y + (narrow ? 62 : 43) + boundsHeight, narrow ? 333 : 60)}
        <Slider
          aria-label={opacityTitle}
          bounds={box(
            narrow ? 358 : 398,
            y + (narrow ? 82 : 43) + boundsHeight,
            narrow ? 333 : 128,
            16,
          )}
          relativeTo={client}
          min={1}
          max={MAX_OPACITY}
          value={value[opacityKey]}
          label={String(value[opacityKey])}
          disabled={!enabled}
          onValueChange={(opacity) => onChange({ [opacityKey]: opacity })}
        />
        <Checkbox
          label="Auto"
          aria-label={tUi("ui.auto.opacity", { target: tUiSource(opacityTitle) })}
          checked={value[autoKey]}
          disabled={!enabled}
          onCheckedChange={(auto) => onChange({ [autoKey]: auto })}
          bounds={box(
            narrow ? 358 : 532,
            y + (narrow ? 104 : 43) + boundsHeight,
            narrow ? 333 : 159,
            16,
          )}
          relativeTo={client}
        />
      </>
    );
  };
  return (
    <>
      {showScope && (
        <Combobox
          aria-label="Display settings scope"
          bounds={box(358, 105, 333, 16)}
          relativeTo={client}
          value={target}
          options={[
            {
              value: CanvasDisplayPreferenceTarget.Defaults,
              label: tUiSource(
                background ? "Background for New Documents" : "Grid for New Documents",
              ),
            },
            ...(hasActiveDocument
              ? [
                  {
                    value: CanvasDisplayPreferenceTarget.Document,
                    label: tUiSource(
                      background
                        ? "Background for the Active Document"
                        : "Grid for the Active Document",
                    ),
                  },
                ]
              : []),
          ]}
          onValueChange={(next) => onTargetChange(next as CanvasDisplayPreferenceTarget)}
        />
      )}
      {background ? (
        <>
          <Divider
            bounds={box(358, 125, 333, 11)}
            relativeTo={client}
            text="Checkered Background"
          />
          {label("Size:", 358, 145, 32)}
          <Combobox
            aria-label="Checker size"
            bounds={box(393, 145, narrow ? 130 : 64, 16)}
            relativeTo={client}
            value={value.checkerboardSize}
            options={CHECKERBOARD_SIZES.map((size) => ({
              value: size,
              label: size === CheckerboardSize.Custom ? "Custom" : size,
            }))}
            disabled={!enabled}
            onValueChange={(size) => onChange({ checkerboardSize: size as CheckerboardSize })}
          />
          {custom && (
            <>
              {dimension(
                "checkerboardCustomWidth",
                "Checker width",
                narrow ? 358 : 461,
                narrow ? 166 : 145,
                narrow ? 72 : 28,
              )}
              {dimension(
                "checkerboardCustomHeight",
                "Checker height",
                narrow ? 438 : 493,
                narrow ? 166 : 145,
                narrow ? 72 : 28,
              )}
            </>
          )}
          <Checkbox
            label="Apply Zoom"
            checked={value.checkerboardZoom}
            disabled={!enabled}
            onCheckedChange={(checkerboardZoom) => onChange({ checkerboardZoom })}
            bounds={box(
              narrow ? 358 : custom ? 527 : 463,
              narrow ? (custom ? 188 : 166) : 145,
              narrow ? 333 : custom ? 164 : 228,
              16,
            )}
            relativeTo={client}
          />
          {label("Colors:", 358, narrow ? (custom ? 212 : 190) : 165, 32)}
          {color(
            "checkerboardColor1",
            "Background color 1",
            narrow ? 398 : 393,
            narrow ? (custom ? 212 : 190) : 165,
            narrow ? 112 : 64,
          )}
          {color(
            "checkerboardColor2",
            "Background color 2",
            narrow ? 518 : 461,
            narrow ? (custom ? 212 : 190) : 165,
            narrow ? 112 : 64,
          )}
        </>
      ) : (
        <>
          {gridGroup(false, 125)}
          {gridGroup(true, (narrow ? 265 : 195) + GRID_BOUNDS_CONTENT_HEIGHT)}
        </>
      )}
      <Button
        text="Reset"
        bounds={box(
          narrow ? 358 : 631,
          background ? (narrow ? 239 : 190) : (narrow ? 393 : 265) + GRID_BOUNDS_CONTENT_HEIGHT,
          60,
          17,
        )}
        relativeTo={client}
        disabled={!enabled}
        onClick={() => {
          setResetVersion((current) => current + 1);
          onReset();
        }}
      />
    </>
  );
}
