import { useEffect, useRef, useState } from "react";

import type { PaletteTranslate } from "$/palette/model";
import {
  PixelationPaletteControl,
  type PixelationPaletteResources,
} from "$/pixelation/palette-control";
import {
  PixelationMethod,
  PixelationMode,
  MAX_GRID_CELL_SIZE,
  type PixelGridAnalysis,
  PIXELATION_SIZES,
  MAX_PIXELATION_SIZE,
  type PixelationSettings,
} from "@xprite/editor-core/import-export";
import {
  Button,
  CanvasSurface,
  Checkbox,
  Combobox,
  ControlFlow,
  Field,
  Input,
  Text,
  TextVariant,
  type CanvasPixelSource,
} from "@xprite/ui";
import { useUiChecker } from "@xprite/ui/assets";
import { observeElementSize } from "@xprite/ui/utils";
export type { PixelationPaletteResources } from "$/pixelation/palette-control";

import styles from "$/pixelation/pixelation.module.css";

const NUMBER_WIDTH = 36;
const METHOD_WIDTH = 112;
const MAX_COLORS = 256;
const MIN_COLORS = 2;
const identity: PaletteTranslate = (text, values) =>
  text.replace(/\{([^}]+)\}/g, (match, key: string) => String(values?.[key] ?? match));
export function PixelationControls({
  settings,
  paletteResources,
  grid,
  sourceSize,
  disabled = false,
  onChange,
  translate = identity,
}: {
  settings: Readonly<PixelationSettings>;
  paletteResources: PixelationPaletteResources;
  grid?: PixelGridAnalysis;
  sourceSize: { width: number; height: number };
  disabled?: boolean;
  onChange(patch: Partial<PixelationSettings>): void;
  translate?: PaletteTranslate;
}) {
  const number = (key: "targetWidth" | "targetHeight" | "maxColors", label: string) => (
    <Field label={translate(label)}>
      <Input
        pixelWidth={NUMBER_WIDTH}
        inputMode="numeric"
        value={String(settings[key])}
        min={key === "maxColors" ? MIN_COLORS : 1}
        max={key === "maxColors" ? MAX_COLORS : MAX_PIXELATION_SIZE}
        step={1}
        disabled={
          disabled || (key === "maxColors" && (!settings.reduceColors || settings.palette !== null))
        }
        onCommit={(value) => onChange({ [key]: Number(value) })}
      />
    </Field>
  );
  const recover = settings.mode === PixelationMode.RecoverGrid;
  const gridCell = (key: "gridCellWidth" | "gridCellHeight", label: string) => (
    <Field label={translate(label)}>
      <Input
        pixelWidth={NUMBER_WIDTH}
        inputMode="decimal"
        value={String(Math.round(settings[key] * 100) / 100)}
        min={1}
        max={MAX_GRID_CELL_SIZE}
        step={0.25}
        disabled={disabled}
        onCommit={(value) => onChange({ [key]: Number(value) })}
      />
    </Field>
  );
  return (
    <div className={styles.controls}>
      <Field label={translate("Action")}>
        <Combobox
          pixelWidth={METHOD_WIDTH}
          value={settings.mode}
          aria-label={translate("Action")}
          disabled={disabled}
          options={[
            { value: PixelationMode.Convert, label: translate("Convert image") },
            { value: PixelationMode.RecoverGrid, label: translate("Recover pixel grid") },
          ]}
          onValueChange={(mode) => onChange({ mode: mode as PixelationMode })}
        />
      </Field>
      {recover ? (
        <>
          <Checkbox
            label={translate("Automatic grid")}
            checked={settings.autoGrid}
            disabled={disabled}
            onCheckedChange={(autoGrid) => onChange({ autoGrid })}
          />
          {settings.autoGrid ? (
            <Text variant={TextVariant.Reading} wrap>
              {grid?.reliable
                ? `${translate("Detected grid")}: ${grid.width} × ${grid.height} px`
                : translate("Choose cell sizes if no grid is detected.")}
            </Text>
          ) : (
            <>
              <ControlFlow className={styles.fields}>
                {gridCell("gridCellWidth", "Cell width")}
                {gridCell("gridCellHeight", "Cell height")}
              </ControlFlow>
              <Text variant={TextVariant.Reading} wrap>
                {translate("Cell sizes are measured in the original image.")}
              </Text>
            </>
          )}
        </>
      ) : (
        <>
          <ControlFlow className={styles.presets}>
            {PIXELATION_SIZES.map((size) => (
              <Button
                key={size}
                slots={{}}
                text={`${size} px`}
                disabled={disabled}
                selected={Math.max(settings.targetWidth, settings.targetHeight) === size}
                onClick={() =>
                  onChange({
                    targetWidth: Math.max(
                      1,
                      Math.round(
                        (sourceSize.width * size) / Math.max(sourceSize.width, sourceSize.height),
                      ),
                    ),
                    targetHeight: Math.max(
                      1,
                      Math.round(
                        (sourceSize.height * size) / Math.max(sourceSize.width, sourceSize.height),
                      ),
                    ),
                  })
                }
              />
            ))}
          </ControlFlow>
          <ControlFlow className={styles.fields}>
            {number("targetWidth", "Width")}
            {number("targetHeight", "Height")}
          </ControlFlow>
          <Checkbox
            label={translate("Lock aspect ratio")}
            checked={settings.lockAspectRatio}
            disabled={disabled}
            onCheckedChange={(lockAspectRatio) => onChange({ lockAspectRatio })}
          />
          <Field label={translate("Method")}>
            <Combobox
              pixelWidth={METHOD_WIDTH}
              value={settings.method}
              aria-label={translate("Method")}
              disabled={disabled}
              options={[
                { value: PixelationMethod.Structure, label: translate("Preserve edges") },
                { value: PixelationMethod.Dominant, label: translate("Dominant colors") },
                { value: PixelationMethod.Box, label: translate("Box average") },
                { value: PixelationMethod.Nearest, label: translate("Nearest-neighbor") },
              ]}
              onValueChange={(method) => onChange({ method: method as PixelationMethod })}
            />
          </Field>
          <Field label={translate("Outline protection")}>
            <Input
              pixelWidth={NUMBER_WIDTH}
              value={String(settings.outlineStrength)}
              inputMode="numeric"
              min={0}
              max={100}
              step={10}
              disabled={disabled}
              onCommit={(value) => onChange({ outlineStrength: Number(value) })}
            />
          </Field>
        </>
      )}
      <Checkbox
        label={translate("Remove noise")}
        checked={settings.removeNoise}
        disabled={disabled}
        onCheckedChange={(removeNoise) => onChange({ removeNoise })}
      />
      <Checkbox
        label={translate("Keep original dimensions")}
        checked={settings.preserveDimensions}
        disabled={disabled}
        onCheckedChange={(preserveDimensions) => onChange({ preserveDimensions })}
      />
      <Checkbox
        label={translate("Limit colors")}
        checked={settings.reduceColors}
        disabled={disabled}
        onCheckedChange={(reduceColors) => onChange({ reduceColors })}
      />
      {settings.reduceColors && (
        <>
          {settings.palette === null && number("maxColors", "Colors")}
          <PixelationPaletteControl
            settings={settings}
            resources={paletteResources}
            disabled={disabled}
            translate={translate}
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
}

export function pixelationDialogLabels(settings: Readonly<PixelationSettings>) {
  return settings.mode === PixelationMode.RecoverGrid
    ? { title: "Restore Pixel Grid", apply: "Restore & Import" }
    : { title: "Pixelate Image", apply: "Pixelate & Import" };
}
function ImagePreview({ pixels, label }: { pixels: CanvasPixelSource; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 240, height: 240 });
  const checker = useUiChecker();
  useEffect(() => (ref.current ? observeElementSize(ref.current, setSize) : undefined), []);
  const fit = Math.min(size.width / pixels.width, size.height / pixels.height);
  const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
  const width = pixels.width * scale,
    height = pixels.height * scale;
  return (
    <div className={styles.stage} ref={ref}>
      <CanvasSurface
        pixels={pixels}
        checker={checker}
        bounds={{ x: 0, y: 0, width: pixels.width, height: pixels.height }}
        aria-label={label}
        className={styles.canvas}
        style={{ width, height, left: (size.width - width) / 2, top: (size.height - height) / 2 }}
      />
    </div>
  );
}
export function PixelationComparison({
  source,
  result,
  preparing,
  translate = identity,
  stacked = false,
  mode = PixelationMode.Convert,
}: {
  source: CanvasPixelSource;
  result: CanvasPixelSource | null;
  preparing: boolean;
  stacked?: boolean;
  mode?: PixelationMode;
  translate?: PaletteTranslate;
}) {
  return (
    <div className={`${styles.comparison} ${stacked ? styles.stacked : ""}`}>
      <div className={styles.image}>
        <Text variant={TextVariant.Reading}>{translate("Original")}</Text>
        <ImagePreview pixels={source} label={translate("Original image")} />
        <Text variant={TextVariant.Reading}>{`${source.width} × ${source.height} px`}</Text>
      </div>
      <div className={styles.image}>
        <Text variant={TextVariant.Reading}>
          {translate(mode === PixelationMode.RecoverGrid ? "Restored" : "Pixelated")}
        </Text>
        {result ? (
          <ImagePreview
            pixels={result}
            label={translate(
              mode === PixelationMode.RecoverGrid ? "Restored image" : "Pixelated image",
            )}
          />
        ) : (
          <div className={styles.stage}>
            <Text variant={TextVariant.Reading}>
              {translate(
                preparing ? "Preparing preview…" : "Adjust settings to preview the result.",
              )}
            </Text>
          </div>
        )}
        <Text variant={TextVariant.Reading}>
          {result ? `${result.width} × ${result.height} px` : ""}
        </Text>
      </div>
    </div>
  );
}
