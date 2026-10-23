import { Fragment, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { algorithmNoteKey } from "$/components/dialogs/pixelation-dialog/algorithm-notes";
import { ImportCompare } from "$/components/dialogs/pixelation-dialog/import-compare";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  type FilePreferences,
  type ImportAction,
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
  Disclosure,
  Divider,
  Text,
  TextVariant,
  defaultActionProps,
  useModalFocus,
} from "@xprite/ui";

import styles from "$/components/dialogs/pixelation-dialog/pixelation-dialog.module.css";

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
const DIALOG_MIN_HEIGHT = 380;
const PREVIEW_MIN = 72;
const GAP = 8;
const SECTION_HEIGHT = 22;
const OPTION_HEIGHT = 34;
const HINT_HEIGHT = 58;
const ROW_HEIGHT = 24;
/** At least the label font's height: the shared Text centres its glyphs and clips what overflows the box. */
const FIELD_LABEL_HEIGHT = 18;
const COMBO_HEIGHT = 30;
const FOOTER_HEIGHT = 34;
const BUTTON_WIDTH = 120;
const SIZE_SEPARATOR = 16;
/** Only these survive between imports; Custom size is a one-off, like the plain resize. */
const REMEMBERED_ALGORITHMS: readonly PixelationAlgorithm[] = [
  PixelationAlgorithm.Auto,
  PixelationAlgorithm.EdgeGrid,
  PixelationAlgorithm.UniformGrid,
];
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
  const rootRef = useRef<HTMLDivElement | null>(null);

  useModalFocus({
    open: !!pending,
    rootRef,
    onKeyDown: (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
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

  if (!pending) return null;
  const chosen: ImportAction =
    action ??
    (workflow.getFilePreferences().importLastAction === "import-as-is"
      ? "import-as-is"
      : "pixelate");
  const pixelate = chosen === "pixelate";
  const showAdvanced = advanced && pixelate;
  const selectedAlgorithm = pending.algorithm;
  const colorPicker = workflow.pixelationOptions.colorPicker;
  const noteKey = algorithmNoteKey(selectedAlgorithm, !!pending.grid?.reliable);
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
      ...(REMEMBERED_ALGORITHMS.includes(selectedAlgorithm)
        ? {
            importPixelationAlgorithm:
              selectedAlgorithm as FilePreferences["importPixelationAlgorithm"],
          }
        : {}),
      // The remembered colour rule is the one for plain imports (pre-pass None): every import opens
      // on PixelOE + lines with Contrast, and switching to None brings this rule back.
      ...(workflow.pixelationOptions.prepass === OutlinePrepass.None
        ? { importColorPicker: colorPicker }
        : {}),
      // The silent Pixelate path ("Don't ask me again") repeats this import's pixelation; the
      // dialog itself still opens on PixelOE + lines next time.
      ...(pixelate
        ? {
            importPixelation: {
              prepass: workflow.pixelationOptions.prepass,
              lineGuide: workflow.pixelationOptions.lineGuide,
              colorPicker,
              reduceColors: workflow.pixelationOptions.reduceColors,
              maxColors: workflow.pixelationOptions.maxColors,
              dither: workflow.pixelationOptions.dither,
            },
          }
        : {}),
      ...(rememberChoice ? { importAsk: false } : {}),
    });
    if (pixelate) workflow.acceptPixelatedImport();
    else workflow.acceptOriginalImport();
  };

  const dialogWidth = Math.min(DIALOG_WIDTH, Math.max(DIALOG_MIN_WIDTH, sceneBounds.width));
  const dialogHeight = Math.min(
    DIALOG_HEIGHT,
    Math.max(DIALOG_MIN_HEIGHT, sceneBounds.height - 16),
  );
  const bounds = {
    x: sceneBounds.x + Math.round((sceneBounds.width - dialogWidth) / 2),
    y: sceneBounds.y + Math.max(0, Math.round((sceneBounds.height - dialogHeight) / 2)),
    width: dialogWidth,
    height: dialogHeight,
  };

  /**
   * Only errors and "no grid found" notices; everything else the labels already say. The notice
   * points at Advanced, so it goes once Advanced is open (the disabled picker says the rest), and
   * it is false with an outline pre-pass, which redraws the picture and keeps the picker working.
   */
  const pixelateMessage = workflow.pixelationError
    ? tUiSource(workflow.pixelationError)
    : pixelate && noteKey && !advanced && workflow.pixelationOptions.prepass === OutlinePrepass.None
      ? `${tUiSource(noteKey)} ${tUi("import.note.picker.needs-grid")}`
      : null;
  const message = pixelate ? pixelateMessage : null;

  return (
    <EditorDialog
      open
      onRootRef={(node) => {
        rootRef.current = node;
      }}
      modal
      constrainToViewport
      resizable={false}
      title={tUi("import.dialog.title")}
      bounds={bounds}
      onOpenChange={(open) => {
        if (!open) workflow.discardEmptyImport();
      }}
    >
      {({ clientBounds: client }) => {
        const width = client.width;
        // Both Pixelate and Keep as is reserve the hint and Advanced rows, so toggling between
        // them never resizes or moves the preview; Keep as is just leaves those rows empty.
        const hintHeight = pixelateMessage ? HINT_HEIGHT + GAP : 0;
        const advancedRowHeight = ROW_HEIGHT + GAP;
        const showDither = showAdvanced && workflow.pixelationOptions.reduceColors;
        const advancedHeight = showAdvanced
          ? 4 * (FIELD_LABEL_HEIGHT + COMBO_HEIGHT + GAP) +
            ROW_HEIGHT +
            GAP +
            (showDither ? FIELD_LABEL_HEIGHT + COMBO_HEIGHT + GAP : 0)
          : 0;
        const bottomStack =
          SECTION_HEIGHT +
          4 +
          OPTION_HEIGHT +
          GAP +
          hintHeight +
          advancedRowHeight +
          advancedHeight +
          ROW_HEIGHT +
          GAP +
          FOOTER_HEIGHT;
        const previewHeight = Math.max(PREVIEW_MIN, client.height - bottomStack - GAP);
        let y = previewHeight + GAP;
        const at = (height: number, extra = 0) => {
          const top = y;
          y += height + extra;
          return { x: client.x, y: client.y + top, width, height };
        };
        const sectionBounds = at(SECTION_HEIGHT, 4);
        const half = Math.round(width / 2);
        const optionY = y;
        y += OPTION_HEIGHT + GAP;
        const hintBounds = pixelateMessage ? at(HINT_HEIGHT, GAP) : null;
        const advancedRow = at(ROW_HEIGHT, GAP);
        const algorithmLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const algorithmCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
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
        const rememberRow = at(ROW_HEIGHT);
        const footerY = client.y + client.height - FOOTER_HEIGHT;
        const option = (value: ImportAction, label: string, x: number, w: number) => (
          <Button
            key={value}
            aria-label={label}
            aria-pressed={chosen === value}
            selected={chosen === value}
            text={label}
            font={FontRole.Compact}
            part="buttonset_item_normal"
            hotPart="buttonset_item_hot"
            bounds={{
              x: client.x + x,
              y: client.y + optionY,
              width: w,
              height: OPTION_HEIGHT,
            }}
            relativeTo={client}
            disabled={workflow.busy}
            onClick={() => {
              setAction(value);
              // Advanced only applies to Pixelate; coming back always starts collapsed.
              if (value !== "pixelate") setAdvanced(false);
            }}
          />
        );
        return (
          <>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height: previewHeight,
              }}
            >
              <ImportCompare
                original={pending.pixels}
                result={workflow.pixelationPreview}
                width={width}
                height={previewHeight}
                comparing={pixelate}
                updating={workflow.pixelationPreviewing}
                labels={{
                  original: tUi("import.dialog.original"),
                  result: tUi("import.dialog.result.label"),
                  preparing: tUi("import.dialog.preparing"),
                  slider: tUi("import.dialog.slider"),
                }}
              />
            </div>
            <Divider
              text={tUi("import.dialog.result")}
              bounds={sectionBounds}
              relativeTo={client}
            />
            {option("pixelate", tUi("import.dialog.pixelate"), 0, half + 1)}
            {option("import-as-is", tUi("import.dialog.import.as.is"), half, width - half)}
            {message && hintBounds && (
              <Text
                variant={TextVariant.Control}
                text={message}
                wrap
                bounds={hintBounds}
                relativeTo={client}
              />
            )}
            {pixelate && (
              <Disclosure
                title={tUi("import.dialog.advanced")}
                open={showAdvanced}
                onToggle={(event) => setAdvanced(event.currentTarget.open)}
                className={styles.advanced}
                style={{
                  position: "absolute",
                  left: 0,
                  top: advancedRow.y - client.y,
                  width,
                  height: advancedRow.height,
                }}
              >
                {null}
              </Disclosure>
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
                    {([PixelationSlot.Width, PixelationSlot.Height] as const).map((slot, index) => {
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
                    })}
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
                x: client.x + width - 2 * BUTTON_WIDTH - 8,
                y: footerY,
                width: BUTTON_WIDTH,
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
                x: client.x + width - BUTTON_WIDTH,
                y: footerY,
                width: BUTTON_WIDTH,
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
