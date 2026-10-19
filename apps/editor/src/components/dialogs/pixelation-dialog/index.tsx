import { Fragment, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import {
  algorithmLabelKey,
  algorithmNoteKey,
  colorPickerLabelKey,
} from "$/components/dialogs/pixelation-dialog/algorithm-notes";
import { ImportCompare } from "$/components/dialogs/pixelation-dialog/import-compare";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  getListedAlgorithms,
  getAllColorPickers,
  type FilePreferences,
  type ImportAction,
  PixelationAlgorithm,
  CellColorPicker,
  PIXELATION_SIZES,
  SNAP_COLOR_PRESETS,
} from "$/managers/preferences/file-preferences";
import type { useEditorWorkflows } from "$/managers/workspace/use-editor-workflows";
import {
  FontRole,
  TextAlignment,
  Button,
  Checkbox,
  Combobox,
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
const SNAP_OPTIONS = SNAP_COLOR_PRESETS.map((count) => ({
  value: String(count),
  label: String(count),
}));
const SNAP_CHECKBOX_SHARE = 0.6;
const SIZE_OPTIONS = PIXELATION_SIZES.map((size) => ({
  value: String(size),
  label: tUi("ui.dimension.pixels", { size }),
}));

export function PixelationDialog({ workflow }: { workflow: Workflow }) {
  useUiLanguage();
  const pending = workflow.pending;
  const sceneBounds = useSceneBounds();
  const [action, setAction] = useState<ImportAction | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sizeDrafts, setSizeDrafts] = useState<{ width?: string; height?: string }>({});
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

  if (!pending) return null;
  const chosen: ImportAction =
    action ??
    (workflow.getFilePreferences().importLastAction === "import-as-is"
      ? "import-as-is"
      : "pixelate");
  const pixelate = chosen === "pixelate";
  const showAdvanced = advanced && pixelate;
  const selectedAlgorithm = pending.algorithm;
  const options = workflow.pixelationOptions;
  /** The size the chosen method produces: its grid's cell count, or the plain target if it found none. */
  const outputSize = pending.grid?.reliable
    ? { width: pending.grid.width, height: pending.grid.height }
    : { width: options.targetWidth, height: options.targetHeight };
  /** Typing a size is just another way to find pixels: the Custom size entry, aspect ratio kept. */
  const commitSize = (axis: "width" | "height", value: string) => {
    setSizeDrafts((drafts) => ({ ...drafts, [axis]: undefined }));
    const typed = Number.parseInt(value, 10);
    if (!Number.isFinite(typed) || typed < 1) return;
    const { width, height } = pending.pixels;
    workflow.setImportAlgorithm(
      PixelationAlgorithm.CustomSize,
      axis === "width"
        ? { width: typed, height: Math.max(1, Math.round((typed * height) / width)) }
        : { width: Math.max(1, Math.round((typed * width) / height)), height: typed },
    );
  };
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
      importColorPicker: colorPicker,
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

  const colorPickerOptions = getAllColorPickers().map((picker) => ({
    value: picker,
    label: tUiSource(colorPickerLabelKey(picker)),
  }));
  const algorithmOptions = getListedAlgorithms().map((algorithm) => ({
    value: algorithm,
    label: tUiSource(algorithmLabelKey(algorithm)),
  }));
  /** Only errors and "no grid found" notices; everything else the labels already say. */
  const pixelateMessage = workflow.pixelationError
    ? tUiSource(workflow.pixelationError)
    : pixelate && noteKey
      ? `${tUiSource(noteKey)} ${tUiSource("import.note.picker.needs-grid")}`
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
      title={tUiSource("import.dialog.title")}
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
        const advancedHeight = showAdvanced
          ? 3 * (FIELD_LABEL_HEIGHT + COMBO_HEIGHT + GAP) + 2 * (ROW_HEIGHT + GAP)
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
        const prepassRow = showAdvanced ? at(ROW_HEIGHT, GAP) : null;
        const snapRow = showAdvanced ? at(COMBO_HEIGHT, GAP - (COMBO_HEIGHT - ROW_HEIGHT)) : null;
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
                  original: tUiSource("import.dialog.original"),
                  result: tUiSource("import.dialog.result.label"),
                  preparing: tUiSource("import.dialog.preparing"),
                  slider: tUiSource("import.dialog.slider"),
                }}
              />
            </div>
            <Divider
              text={tUiSource("import.dialog.result")}
              bounds={sectionBounds}
              relativeTo={client}
            />
            {option("pixelate", tUiSource("import.dialog.pixelate"), 0, half + 1)}
            {option("import-as-is", tUiSource("import.dialog.import.as.is"), half, width - half)}
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
                title={tUiSource("import.dialog.advanced")}
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
                  text={tUiSource("import.dialog.algorithm")}
                  bounds={algorithmLabel}
                  relativeTo={client}
                />
                <Combobox
                  aria-label={tUiSource("import.dialog.algorithm")}
                  bounds={algorithmCombo}
                  relativeTo={client}
                  value={selectedAlgorithm}
                  disabled={workflow.busy}
                  options={algorithmOptions}
                  onValueChange={(value) =>
                    workflow.setImportAlgorithm(value as PixelationAlgorithm)
                  }
                />
                <Text
                  variant={TextVariant.Control}
                  text={tUiSource("import.dialog.color.picker")}
                  bounds={pickerLabel}
                  relativeTo={client}
                />
                <Combobox
                  aria-label={tUiSource("import.dialog.color.picker")}
                  bounds={pickerCombo}
                  relativeTo={client}
                  value={colorPicker}
                  // Without a grid the preview is a plain resize, which has no per-cell colour to pick.
                  disabled={workflow.busy || !pending.grid?.reliable}
                  options={colorPickerOptions}
                  onValueChange={(value) =>
                    workflow.setPixelationOptions({
                      colorPicker: value as CellColorPicker,
                    })
                  }
                />
                {sizeLabel && sizeRow && (
                  <>
                    {(["width", "height"] as const).map((axis, index) => {
                      const half = Math.floor((sizeRow.width - SIZE_SEPARATOR) / 2);
                      const x = index === 0 ? 0 : half + SIZE_SEPARATOR;
                      const w = index === 0 ? half : sizeRow.width - half - SIZE_SEPARATOR;
                      const draft = sizeDrafts[axis];
                      return (
                        <Fragment key={axis}>
                          <Text
                            variant={TextVariant.Control}
                            text={axis === "width" ? "Width:" : "Height:"}
                            bounds={{ ...sizeLabel, x: sizeLabel.x + x, width: w }}
                            relativeTo={client}
                          />
                          <Combobox
                            aria-label={axis === "width" ? "Width" : "Height"}
                            bounds={{ ...sizeRow, x: sizeRow.x + x, width: w }}
                            relativeTo={client}
                            editable
                            inputMode="numeric"
                            suffix="px"
                            value={draft ?? String(outputSize[axis])}
                            disabled={workflow.busy}
                            options={SIZE_OPTIONS}
                            onDraftValueChange={(value) =>
                              setSizeDrafts((drafts) => ({ ...drafts, [axis]: value }))
                            }
                            onValueChange={(value) => commitSize(axis, value)}
                          />
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
            {prepassRow && (
              <>
                <Checkbox
                  label={tUiSource("import.dialog.pixeloe.prepass")}
                  checked={options.pixeloePrepass}
                  disabled={workflow.busy}
                  onCheckedChange={(pixeloePrepass) =>
                    workflow.setPixelationOptions({ pixeloePrepass })
                  }
                  bounds={{ ...prepassRow, width: Math.round(prepassRow.width * 0.6) }}
                  relativeTo={client}
                />
                <Button
                  text={tUiSource("import.dialog.pixeloe.preset")}
                  font={FontRole.Compact}
                  disabled={workflow.busy}
                  bounds={{
                    ...prepassRow,
                    x: prepassRow.x + Math.round(prepassRow.width * 0.6) + GAP,
                    width: prepassRow.width - Math.round(prepassRow.width * 0.6) - GAP,
                  }}
                  relativeTo={client}
                  onClick={() =>
                    workflow.setPixelationOptions({
                      pixeloePrepass: true,
                      colorPicker: CellColorPicker.Contrast,
                    })
                  }
                />
              </>
            )}
            {snapRow && (
              <>
                <Checkbox
                  label={tUiSource("import.dialog.snap.palette")}
                  checked={options.snapPalette}
                  disabled={workflow.busy}
                  onCheckedChange={(snapPalette) => workflow.setPixelationOptions({ snapPalette })}
                  bounds={{
                    ...snapRow,
                    height: ROW_HEIGHT,
                    width: Math.round(snapRow.width * SNAP_CHECKBOX_SHARE),
                  }}
                  relativeTo={client}
                />
                <Combobox
                  aria-label={tUiSource("import.dialog.snap.colors")}
                  bounds={{
                    ...snapRow,
                    x: snapRow.x + Math.round(snapRow.width * SNAP_CHECKBOX_SHARE) + GAP,
                    width: snapRow.width - Math.round(snapRow.width * SNAP_CHECKBOX_SHARE) - GAP,
                  }}
                  relativeTo={client}
                  value={String(options.snapColors)}
                  // Only the checked step has a colour count to choose; otherwise it stays inert.
                  disabled={workflow.busy || !options.snapPalette}
                  options={SNAP_OPTIONS}
                  onValueChange={(value) =>
                    workflow.setPixelationOptions({ snapColors: Number(value) })
                  }
                />
              </>
            )}
            <Checkbox
              label={tUiSource("import.dialog.remember")}
              checked={rememberChoice}
              onCheckedChange={setRememberChoice}
              bounds={rememberRow}
              relativeTo={client}
            />
            <Button
              text={tUiSource("import.dialog.import")}
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
              text={tUiSource("Cancel")}
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
