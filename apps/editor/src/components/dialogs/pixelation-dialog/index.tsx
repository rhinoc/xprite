import { Fragment, useMemo, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { ImportAdvanced } from "$/components/dialogs/pixelation-dialog/import-advanced";
import { ImportCompare } from "$/components/dialogs/pixelation-dialog/import-compare";
import { ImportMode } from "$/components/dialogs/pixelation-dialog/import-mode";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  DEFAULT_REMOVE_BACKGROUND,
  removeBackground,
  RemoveBackgroundMode,
  sampleKeyColor,
  type RemoveBackgroundSettings,
} from "$/managers/import/remove-background";
import {
  type ImportAction,
  isRememberedPixelationAlgorithm,
  OutlinePrepass,
  PixelationAlgorithm,
} from "$/managers/preferences/file-preferences";
import type { useEditorWorkflows } from "$/managers/workspace/use-editor-workflows";
import { PixelationSlot, pixelationLabelKey, usePixelationBase } from "@xprite/editor-ui";
import {
  FontRole,
  TextAlignment,
  Button,
  Checkbox,
  CheckboxMode,
  CheckboxShape,
  Divider,
  Slider,
  Text,
  TextVariant,
  defaultActionProps,
  useModalFocus,
  ScrollArea,
} from "@xprite/ui";
import { useElementSize } from "@xprite/ui/utils";

type Workflow = Pick<
  ReturnType<typeof useEditorWorkflows>,
  | "pending"
  | "pixelationOptions"
  | "pixelationPreview"
  | "pixelationPreviewing"
  | "pixelationError"
  | "setPixelationOptions"
  | "setImportAlgorithm"
  | "setFilePreferences"
  | "getFilePreferences"
  | "busy"
  | "discardEmptyImport"
  | "acceptOriginalImport"
  | "acceptPixelatedImport"
>;

/** Same shell as New Sprite: a small fixed-size window, section dividers, button set, OK / Cancel. */
const DIALOG_WIDTH = 380;
const DIALOG_MIN_WIDTH = 280;
const DIALOG_HEIGHT = 560;
const PREVIEW_MIN = 72;
const PREVIEW_MAX = 280;
const PREVIEW_SHARE = 0.52;
const PARAMETER_MIN_HEIGHT = 64;
const GAP = 8;
const SECTION_HEIGHT = 22;
const OPTION_HEIGHT = 34;
const HINT_HEIGHT = 58;
const ROW_HEIGHT = 24;
/** At least the label font's height: the shared Text centres its glyphs and clips what overflows the box. */
const FIELD_LABEL_HEIGHT = 18;
const COMBO_HEIGHT = 30;
const FOOTER_HEIGHT = 34;
const FOOTER_STACK_HEIGHT = ROW_HEIGHT + GAP + FOOTER_HEIGHT;
const BUTTON_WIDTH = 120;
const BUTTON_GAP = 8;
const SIZE_SEPARATOR = 16;
/** Classic themed vertical track (scrollbar_size 12 × artwork scale 2), in scene units. */
const VERTICAL_SCROLLBAR_TRACK = 24;
/** The dialog has no palette browser; everything else of the shared base controls is here. */
const HIDDEN_SLOTS: ReadonlySet<PixelationSlot> = new Set([
  PixelationSlot.Palette,
  PixelationSlot.PaletteMenu,
]);
/** Width of the Limit colors checkbox in its row; the colour count sits to its right. */
const LIMIT_SHARE = 0.55;
const COUNT_LABEL_SHARE = 0.2;

export function PixelationDialog({ workflow }: { workflow: Workflow }) {
  useUiLanguage();
  const pending = workflow.pending;
  const sceneBounds = useSceneBounds();
  const [action, setAction] = useState<ImportAction | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [removeBg, setRemoveBg] = useState<RemoveBackgroundSettings>(DEFAULT_REMOVE_BACKGROUND);
  const [pickingColor, setPickingColor] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const parameterViewport = useRef<HTMLDivElement>(null);
  const parameterSize = useElementSize(parameterViewport);

  useModalFocus({
    open: !!pending,
    rootRef,
    onKeyDown: (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (pickingColor) {
        setPickingColor(false);
        return;
      }
      workflow.discardEmptyImport();
    },
  });

  const base = usePixelationBase({
    settings: workflow.pixelationOptions,
    algorithm: pending?.algorithm ?? PixelationAlgorithm.Auto,
    grid: pending?.grid ?? undefined,
    sourceSize: pending?.pixels ?? { width: 1, height: 1 },
    busy: workflow.busy,
    hidden: HIDDEN_SLOTS,
    translate: (text, values) => tUiSource(pixelationLabelKey(text), values),
    onChange: workflow.setPixelationOptions,
    onAlgorithm: (algorithm, size) => void workflow.setImportAlgorithm(algorithm, size),
  });

  const chosen: ImportAction =
    action ??
    (workflow.getFilePreferences().importLastAction === "import-as-is"
      ? "import-as-is"
      : "pixelate");
  const pixelate = chosen === "pixelate";
  const removeBgOptions = useMemo(
    () => ({
      mode: removeBg.mode,
      tolerance: removeBg.tolerance,
      keyColor: removeBg.keyColor,
    }),
    [removeBg.mode, removeBg.tolerance, removeBg.keyColor],
  );
  /** Source the classical remover runs on: pixelated preview, else the original. */
  const removeBgSource = pixelate ? workflow.pixelationPreview : (pending?.pixels ?? null);
  const processedPreview = useMemo(() => {
    if (!removeBg.enabled || !removeBgSource) return null;
    return removeBackground(removeBgSource, removeBgOptions);
  }, [removeBg.enabled, removeBgSource, removeBgOptions]);
  const displayResult = removeBg.enabled
    ? processedPreview
    : pixelate
      ? workflow.pixelationPreview
      : null;
  const showCompare = pixelate || removeBg.enabled;

  if (!pending) return null;
  const showAdvanced = advanced && pixelate;
  const selectedAlgorithm = pending.algorithm;
  const colorPicker = workflow.pixelationOptions.colorPicker;
  const canImport =
    !workflow.busy &&
    (!pixelate || (!workflow.pixelationPreviewing && !!workflow.pixelationPreview));

  /** Every confirmed pick becomes the default next time; the checkbox only turns the question off. */
  const confirm = () => {
    if (!canImport) return;
    workflow.setFilePreferences({
      ...workflow.getFilePreferences(),
      importLastAction: chosen,
      // "Resize only" is a one-off choice; persisting it would silently shrink later imports.
      ...(isRememberedPixelationAlgorithm(selectedAlgorithm)
        ? { importPixelationAlgorithm: selectedAlgorithm }
        : {}),
      // Plain imports start with this colour rule; outline pre-passes keep their own selection.
      ...(workflow.pixelationOptions.prepass === OutlinePrepass.None
        ? { importColorPicker: colorPicker }
        : {}),
      // The silent Pixelate path ("Don't ask me again") repeats this import's saved settings.
      ...(pixelate
        ? {
            importPixelation: {
              prepass: workflow.pixelationOptions.prepass,
              lineGuide: workflow.pixelationOptions.lineGuide,
              colorPicker,
              reduceColors: workflow.pixelationOptions.reduceColors,
              maxColors: workflow.pixelationOptions.maxColors,
              dither: workflow.pixelationOptions.dither,
              removeNoise: workflow.pixelationOptions.removeNoise,
            },
          }
        : {}),
      ...(rememberChoice ? { importAsk: false } : {}),
    });
    if (pixelate) {
      const base = workflow.pixelationPreview;
      if (!base) return;
      workflow.acceptPixelatedImport(
        removeBg.enabled ? removeBackground(base, removeBgOptions) : undefined,
      );
    } else {
      workflow.acceptOriginalImport(
        removeBg.enabled ? removeBackground(pending.pixels, removeBgOptions) : undefined,
      );
    }
  };

  const showGridSource = showAdvanced && base[PixelationSlot.GridSource].visible;
  const dialogWidth = Math.min(DIALOG_WIDTH, Math.max(DIALOG_MIN_WIDTH, sceneBounds.width));
  const dialogHeight = Math.min(DIALOG_HEIGHT, Math.max(1, sceneBounds.height - 16));
  const bounds = {
    x: sceneBounds.x + Math.round((sceneBounds.width - dialogWidth) / 2),
    y: sceneBounds.y + Math.max(0, Math.round((sceneBounds.height - dialogHeight) / 2)),
    width: dialogWidth,
    height: dialogHeight,
  };

  const pixelateMessage = workflow.pixelationError ? tUiSource(workflow.pixelationError) : null;
  const message = pixelate ? pixelateMessage : null;

  return (
    <EditorDialog
      open
      onRootRef={(node) => {
        rootRef.current = node;
      }}
      modal
      constrainToViewport
      scrollX={false}
      scrollY={false}
      resizable={false}
      title={tUi("import.dialog.title")}
      bounds={bounds}
      onOpenChange={(open) => {
        if (!open) workflow.discardEmptyImport();
      }}
    >
      {({ clientBounds: client }) => {
        const showDither = showAdvanced && workflow.pixelationOptions.reduceColors;
        const previewHeight = Math.max(
          PREVIEW_MIN,
          Math.min(
            PREVIEW_MAX,
            Math.round(client.height * PREVIEW_SHARE),
            client.height - FOOTER_STACK_HEIGHT - PARAMETER_MIN_HEIGHT - GAP * 2,
          ),
        );
        const parameterTop = previewHeight + GAP;
        const parameterHeight = Math.max(
          0,
          client.height - parameterTop - FOOTER_STACK_HEIGHT - GAP,
        );
        const width = parameterSize.width || Math.max(0, client.width - VERTICAL_SCROLLBAR_TRACK);
        let y = 0;
        const at = (height: number, extra = 0) => {
          const top = y;
          y += height + extra;
          return { x: client.x, y: client.y + top, width, height };
        };
        const sectionBounds = at(SECTION_HEIGHT, 4);
        const optionY = y;
        y += OPTION_HEIGHT + GAP;
        const hintBounds = pixelateMessage ? at(HINT_HEIGHT, GAP) : null;
        const advancedRow = at(ROW_HEIGHT, GAP);
        const algorithmLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const algorithmCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        const gridSourceLabel = showGridSource ? at(FIELD_LABEL_HEIGHT) : null;
        const gridSourceCombo = showGridSource ? at(COMBO_HEIGHT, GAP) : null;
        const sizeLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const sizeRow = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        const pickerLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const pickerCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        // Outline pre-pass and, for PixelOE + lines, its line guide share one row.
        const prepassLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const prepassCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        const limitRow = showAdvanced ? at(ROW_HEIGHT, GAP) : null;
        const ditherLabel = showDither ? at(FIELD_LABEL_HEIGHT) : null;
        const ditherCombo = showDither ? at(COMBO_HEIGHT, GAP) : null;
        const noiseRow = showAdvanced ? at(ROW_HEIGHT, GAP) : null;
        const removeBgRow = at(ROW_HEIGHT, GAP);
        const removeModeRow = removeBg.enabled ? at(ROW_HEIGHT, GAP) : null;
        const removeTolRow = removeBg.enabled ? at(ROW_HEIGHT, GAP) : null;
        const removePickRow =
          removeBg.enabled && removeBg.mode === RemoveBackgroundMode.Manual
            ? at(ROW_HEIGHT, GAP)
            : null;
        const parameterContentHeight = y;
        const rememberRow = {
          x: client.x,
          y: client.y + client.height - FOOTER_STACK_HEIGHT,
          width: client.width,
          height: ROW_HEIGHT,
        };
        const footerY = rememberRow.y + ROW_HEIGHT + GAP;
        const buttonWidth = Math.min(
          BUTTON_WIDTH,
          Math.max(72, Math.floor((client.width - BUTTON_GAP) / 2)),
        );
        return (
          <>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: client.width,
                height: previewHeight,
              }}
            >
              <ImportCompare
                original={pending.pixels}
                result={displayResult}
                width={client.width}
                height={previewHeight}
                comparing={showCompare}
                updating={pixelate && workflow.pixelationPreviewing}
                picking={pickingColor}
                onPick={(x, y) => {
                  if (!removeBgSource) return;
                  const key = sampleKeyColor(removeBgSource, x, y);
                  if (!key) return;
                  setRemoveBg((prev) => ({ ...prev, keyColor: key }));
                  setPickingColor(false);
                }}
                labels={{
                  original: tUi("import.dialog.original"),
                  result: removeBg.enabled
                    ? tUi("import.dialog.remove.background.result")
                    : tUi("import.dialog.result.label"),
                  preparing: tUi("import.dialog.preparing"),
                  slider: tUi("import.dialog.slider"),
                }}
              />
            </div>
            <ScrollArea
              scrollX={false}
              scrollY
              reserveScrollbarGutter
              viewportRef={parameterViewport}
              viewportProps={{
                role: "region",
                "aria-label": tUi("ui.import.options"),
                "data-ui-pixelation-fields": "",
              }}
              style={{
                position: "absolute",
                left: 0,
                top: parameterTop,
                width: client.width,
                height: parameterHeight,
              }}
              contentStyle={{
                width: "100%",
                height: parameterContentHeight,
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <Divider
                text={tUi("import.dialog.result")}
                bounds={sectionBounds}
                relativeTo={client}
              />
              <ImportMode
                value={chosen}
                disabled={workflow.busy}
                bounds={{ x: client.x, y: client.y + optionY, width, height: OPTION_HEIGHT }}
                relativeTo={client}
                onChange={(value) => {
                  setAction(value);
                  if (value !== "pixelate") setAdvanced(false);
                }}
              />
              {message && hintBounds && (
                <Text
                  variant={TextVariant.Control}
                  text={message}
                  wrap
                  bounds={hintBounds}
                  relativeTo={client}
                />
              )}
              {advancedRow && (
                <ImportAdvanced
                  open={showAdvanced}
                  disabled={!pixelate}
                  onChange={setAdvanced}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: advancedRow.y - client.y,
                    width,
                    height: advancedRow.height,
                  }}
                />
              )}
              {algorithmLabel && algorithmCombo && pickerLabel && pickerCombo && (
                <>
                  <Text
                    variant={TextVariant.Control}
                    text={base[PixelationSlot.Algorithm].label ?? ""}
                    bounds={algorithmLabel}
                    relativeTo={client}
                  />
                  {base[PixelationSlot.Algorithm].render({
                    bounds: algorithmCombo,
                    relativeTo: client,
                  })}
                  {gridSourceLabel && gridSourceCombo && (
                    <>
                      <Text
                        variant={TextVariant.Control}
                        text={base[PixelationSlot.GridSource].label ?? ""}
                        bounds={gridSourceLabel}
                        relativeTo={client}
                      />
                      {base[PixelationSlot.GridSource].render({
                        bounds: gridSourceCombo,
                        relativeTo: client,
                      })}
                    </>
                  )}
                  <Text
                    variant={TextVariant.Control}
                    text={base[PixelationSlot.ColorPicker].label ?? ""}
                    bounds={pickerLabel}
                    relativeTo={client}
                  />
                  {base[PixelationSlot.ColorPicker].render({
                    bounds: pickerCombo,
                    relativeTo: client,
                  })}
                  {prepassLabel &&
                    prepassCombo &&
                    ([PixelationSlot.Prepass, PixelationSlot.LineGuide] as const).map(
                      (slot, index) => {
                        if (!base[slot].visible) return null;
                        const half = Math.floor((prepassCombo.width - GAP) / 2);
                        const x = index === 0 ? 0 : half + GAP;
                        const w = index === 0 ? half : prepassCombo.width - half - GAP;
                        return (
                          <Fragment key={slot}>
                            <Text
                              variant={TextVariant.Control}
                              text={base[slot].label ?? ""}
                              bounds={{ ...prepassLabel, x: prepassLabel.x + x, width: w }}
                              relativeTo={client}
                            />
                            {base[slot].render({
                              bounds: { ...prepassCombo, x: prepassCombo.x + x, width: w },
                              relativeTo: client,
                            })}
                          </Fragment>
                        );
                      },
                    )}
                  {sizeLabel && sizeRow && (
                    <>
                      {([PixelationSlot.Width, PixelationSlot.Height] as const).map(
                        (slot, index) => {
                          const half = Math.floor((sizeRow.width - SIZE_SEPARATOR) / 2);
                          const x = index === 0 ? 0 : half + SIZE_SEPARATOR;
                          const w = index === 0 ? half : sizeRow.width - half - SIZE_SEPARATOR;
                          return (
                            <Fragment key={slot}>
                              <Text
                                variant={TextVariant.Control}
                                text={base[slot].label ?? ""}
                                bounds={{ ...sizeLabel, x: sizeLabel.x + x, width: w }}
                                relativeTo={client}
                              />
                              {base[slot].render({
                                bounds: { ...sizeRow, x: sizeRow.x + x, width: w },
                                relativeTo: client,
                              })}
                            </Fragment>
                          );
                        },
                      )}
                      <Text
                        variant={TextVariant.Control}
                        text="×"
                        bounds={{
                          ...sizeRow,
                          x: sizeRow.x + Math.floor((sizeRow.width - SIZE_SEPARATOR) / 2),
                          width: SIZE_SEPARATOR,
                          y: sizeRow.y + 8,
                          height: 14,
                        }}
                        align={TextAlignment.Center}
                        relativeTo={client}
                      />
                    </>
                  )}
                </>
              )}
              {limitRow && (
                <>
                  {base[PixelationSlot.LimitColors].render({
                    bounds: { ...limitRow, width: Math.round(limitRow.width * LIMIT_SHARE) },
                    relativeTo: client,
                  })}
                  {base[PixelationSlot.Colors].visible && (
                    <>
                      <Text
                        variant={TextVariant.Control}
                        text={base[PixelationSlot.Colors].label ?? ""}
                        bounds={{
                          ...limitRow,
                          x: limitRow.x + Math.round(limitRow.width * LIMIT_SHARE) + GAP,
                          width: Math.round(limitRow.width * COUNT_LABEL_SHARE),
                        }}
                        relativeTo={client}
                      />
                      {base[PixelationSlot.Colors].render({
                        bounds: {
                          ...limitRow,
                          x:
                            limitRow.x +
                            Math.round(limitRow.width * (LIMIT_SHARE + COUNT_LABEL_SHARE)) +
                            2 * GAP,
                          width:
                            limitRow.width -
                            Math.round(limitRow.width * (LIMIT_SHARE + COUNT_LABEL_SHARE)) -
                            2 * GAP,
                        },
                        relativeTo: client,
                      })}
                    </>
                  )}
                </>
              )}
              {ditherLabel && ditherCombo && base[PixelationSlot.Dither].visible && (
                <>
                  <Text
                    variant={TextVariant.Control}
                    text={base[PixelationSlot.Dither].label ?? ""}
                    bounds={ditherLabel}
                    relativeTo={client}
                  />
                  {base[PixelationSlot.Dither].render({
                    bounds: ditherCombo,
                    relativeTo: client,
                  })}
                </>
              )}
              {noiseRow && (
                <Checkbox
                  label={tUi("ui.remove.noise")}
                  checked={workflow.pixelationOptions.removeNoise}
                  disabled={workflow.busy}
                  onCheckedChange={(removeNoise) => workflow.setPixelationOptions({ removeNoise })}
                  bounds={noiseRow}
                  relativeTo={client}
                />
              )}
              <Checkbox
                label={tUi("import.dialog.remove.background")}
                checked={removeBg.enabled}
                onCheckedChange={(enabled) => {
                  setRemoveBg((prev) => ({ ...prev, enabled }));
                  if (!enabled) setPickingColor(false);
                }}
                bounds={removeBgRow}
                relativeTo={client}
              />
              {removeModeRow && (
                <>
                  <Checkbox
                    mode={CheckboxMode.Radio}
                    shape={CheckboxShape.Round}
                    label={tUi("import.dialog.remove.background.auto")}
                    checked={removeBg.mode === RemoveBackgroundMode.Auto}
                    onCheckedChange={() => {
                      setRemoveBg((prev) => ({ ...prev, mode: RemoveBackgroundMode.Auto }));
                      setPickingColor(false);
                    }}
                    bounds={{ ...removeModeRow, width: Math.floor(removeModeRow.width / 2) }}
                    relativeTo={client}
                  />
                  <Checkbox
                    mode={CheckboxMode.Radio}
                    shape={CheckboxShape.Round}
                    label={tUi("import.dialog.remove.background.manual")}
                    checked={removeBg.mode === RemoveBackgroundMode.Manual}
                    onCheckedChange={() =>
                      setRemoveBg((prev) => ({
                        ...prev,
                        mode: RemoveBackgroundMode.Manual,
                        keyColor: prev.keyColor,
                      }))
                    }
                    bounds={{
                      ...removeModeRow,
                      x: removeModeRow.x + Math.floor(removeModeRow.width / 2),
                      width: Math.ceil(removeModeRow.width / 2),
                    }}
                    relativeTo={client}
                  />
                </>
              )}
              {removeTolRow && (
                <>
                  <Text
                    variant={TextVariant.Control}
                    text={tUi("import.dialog.remove.background.tolerance")}
                    bounds={{
                      ...removeTolRow,
                      width: Math.round(removeTolRow.width * 0.4),
                    }}
                    relativeTo={client}
                  />
                  <Slider
                    aria-label={tUi("import.dialog.remove.background.tolerance")}
                    bounds={{
                      ...removeTolRow,
                      x: removeTolRow.x + Math.round(removeTolRow.width * 0.4) + GAP,
                      width: removeTolRow.width - Math.round(removeTolRow.width * 0.4) - GAP,
                    }}
                    relativeTo={client}
                    value={removeBg.tolerance}
                    min={0}
                    max={120}
                    label={
                      removeBg.mode === RemoveBackgroundMode.Auto
                        ? tUi("import.dialog.remove.background.auto.tol")
                        : String(removeBg.tolerance)
                    }
                    disabled={removeBg.mode === RemoveBackgroundMode.Auto}
                    onValueChange={(tolerance) => setRemoveBg((prev) => ({ ...prev, tolerance }))}
                  />
                </>
              )}
              {removePickRow && (
                <Button
                  text={
                    pickingColor
                      ? tUi("import.dialog.remove.background.picking")
                      : tUi("import.dialog.remove.background.pick")
                  }
                  font={FontRole.Compact}
                  part="button_normal"
                  hotPart="button_hot"
                  bounds={removePickRow}
                  relativeTo={client}
                  selected={pickingColor}
                  onClick={() => setPickingColor((on) => !on)}
                />
              )}
            </ScrollArea>
            <Checkbox
              label={tUi("import.dialog.remember")}
              checked={rememberChoice}
              onCheckedChange={setRememberChoice}
              bounds={rememberRow}
              relativeTo={client}
            />
            <Button
              text={tUi("import.dialog.import")}
              {...defaultActionProps()}
              font={FontRole.Primary}
              part="button_normal"
              hotPart="button_hot"
              focusedPart="button_focused"
              pushedPart="button_selected"
              disabled={!canImport}
              bounds={{
                x: client.x + client.width - 2 * buttonWidth - BUTTON_GAP,
                y: footerY,
                width: buttonWidth,
                height: FOOTER_HEIGHT,
              }}
              relativeTo={client}
              onClick={confirm}
            />
            <Button
              text={tUi("ui.cancel")}
              font={FontRole.Primary}
              part="button_normal"
              hotPart="button_hot"
              focusedPart="button_focused"
              pushedPart="button_selected"
              bounds={{
                x: client.x + client.width - buttonWidth,
                y: footerY,
                width: buttonWidth,
                height: FOOTER_HEIGHT,
              }}
              relativeTo={client}
              onClick={workflow.discardEmptyImport}
            />
          </>
        );
      }}
    </EditorDialog>
  );
}
