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
  type ImportAction,
  PixelationAlgorithm,
  CellColorPicker,
  PixelationMode,
  PIXELATION_SIZES,
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
  /** Output size: the detected grid's cell count until the user sets one. */
  const detected = options.mode === PixelationMode.RecoverGrid ? pending.grid : undefined;
  const outputSize = {
    width: detected?.width ?? options.targetWidth,
    height: detected?.height ?? options.targetHeight,
  };
  const commitSize = (axis: "width" | "height", value: string) => {
    setSizeDrafts((drafts) => ({ ...drafts, [axis]: undefined }));
    const size = Number.parseInt(value, 10);
    if (!Number.isFinite(size) || size < 1) return;
    workflow.setPixelationOptions({
      mode: PixelationMode.Convert,
      reduceColors: options.reduceColors,
      ...(axis === "width" ? { targetWidth: size } : { targetHeight: size }),
    });
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
      ...(selectedAlgorithm === "resize" ? {} : { importPixelationAlgorithm: selectedAlgorithm }),
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
  const message = workflow.pixelationError
    ? tUiSource(workflow.pixelationError)
    : pixelate && noteKey
      ? tUiSource(noteKey)
      : null;

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
        const hintHeight = message ? HINT_HEIGHT + GAP : 0;
        const advancedRowHeight = pixelate ? ROW_HEIGHT + GAP : 0;
        const advancedHeight = showAdvanced ? 3 * (FIELD_LABEL_HEIGHT + COMBO_HEIGHT + GAP) : 0;
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
        const hintBounds = message ? at(HINT_HEIGHT, GAP) : null;
        const advancedRow = at(pixelate ? ROW_HEIGHT : 0, pixelate ? GAP : 0);
        const algorithmLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const algorithmCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        const pickerLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const pickerCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        const sizeLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT) : null;
        const sizeRow = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
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
                  disabled={workflow.busy}
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
