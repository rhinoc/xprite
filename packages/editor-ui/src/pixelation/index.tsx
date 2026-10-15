import { useEffect, useRef, useState, type ReactNode } from "react";

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
  PIXELATION_METHOD_OPTIONS,
  MAX_PIXELATION_SIZE,
  type PixelationSettings,
} from "@xprite/editor-core/import-export";
import {
  Button,
  CanvasSurface,
  Checkbox,
  Combobox,
  ControlFlow,
  ContentLayout,
  ContentPadding,
  Field,
  FieldLayout,
  Input,
  Panel,
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
function ControlGroup({
  grouped,
  title,
  order,
  children,
}: {
  grouped: boolean;
  title: string;
  order: string;
  children: ReactNode;
}) {
  return grouped ? (
    <Panel
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      contentGap={4}
      title={title}
      className={`${styles.group} ${order}`}
    >
      <div className={styles.groupRow}>{children}</div>
    </Panel>
  ) : (
    <>{children}</>
  );
}
export function PixelationControls({
  settings,
  paletteResources,
  grid,
  sourceSize,
  disabled = false,
  onChange,
  translate = identity,
  grouped = false,
}: {
  settings: Readonly<PixelationSettings>;
  paletteResources: PixelationPaletteResources;
  grid?: PixelGridAnalysis;
  sourceSize: { width: number; height: number };
  disabled?: boolean;
  onChange(patch: Partial<PixelationSettings>): void;
  translate?: PaletteTranslate;
  /** Related controls in titled group boxes that sit side by side (tool pages); the editor dialog keeps one column. */
  grouped?: boolean;
}) {
  const fieldProps = grouped
    ? { layout: FieldLayout.Inline, className: styles.inlineField }
    : undefined;
  const number = (key: "targetWidth" | "targetHeight" | "maxColors", label: string) => (
    <Field label={translate(label)} {...fieldProps}>
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
    <Field label={translate(label)} {...fieldProps}>
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
    <div className={`${styles.controls} ${grouped ? styles.grouped : ""}`}>
      <ControlGroup grouped={grouped} title={translate("Mode")} order={styles.groupMode}>
        <Field label={translate("Action")} {...fieldProps}>
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
        {recover && (
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
        )}
      </ControlGroup>
      {!recover && (
        <>
          <ControlGroup grouped={grouped} title={translate("Size")} order={styles.groupSize}>
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
                          (sourceSize.height * size) /
                            Math.max(sourceSize.width, sourceSize.height),
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
          </ControlGroup>
          <ControlGroup
            grouped={grouped}
            title={translate("Sampling")}
            order={styles.groupSampling}
          >
            <Field label={translate("Method")} {...fieldProps}>
              <Combobox
                pixelWidth={METHOD_WIDTH}
                value={settings.method}
                aria-label={translate("Method")}
                disabled={disabled}
                options={PIXELATION_METHOD_OPTIONS.map((option) => ({
                  ...option,
                  label: translate(option.label),
                }))}
                onValueChange={(method) => onChange({ method: method as PixelationMethod })}
              />
            </Field>
            <Field label={translate("Outline protection")} {...fieldProps}>
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
          </ControlGroup>
        </>
      )}
      <ControlGroup grouped={grouped} title={translate("Output")} order={styles.groupOutput}>
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
      </ControlGroup>
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
  fill = false,
  mode = PixelationMode.Convert,
}: {
  source: CanvasPixelSource;
  result: CanvasPixelSource | null;
  preparing: boolean;
  stacked?: boolean;
  /** Stretch to the parent instead of fixed-height stages (tool pages). */
  fill?: boolean;
  mode?: PixelationMode;
  translate?: PaletteTranslate;
}) {
  return (
    <div
      className={`${styles.comparison} ${stacked ? styles.stacked : ""} ${fill ? styles.fill : ""}`}
    >
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
