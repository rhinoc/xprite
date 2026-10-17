import { useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import {
  algorithmHintKey,
  algorithmLabelKey,
  algorithmNoteKey,
  colorPickerHintKey,
  colorPickerLabelKey,
} from "$/components/dialogs/pixelation-dialog/algorithm-notes";
import { ImportCompare } from "$/components/dialogs/pixelation-dialog/import-compare";
import { tUiSource, useUiLanguage } from "$/i18n";
import {
  getAllAlgorithms,
  getAllColorPickers,
  type ImportAction,
  PixelationAlgorithm,
  PixelationMode,
  CellColorPicker,
} from "$/managers/preferences/file-preferences";
import type { useEditorWorkflows } from "$/managers/workspace/use-editor-workflows";
import {
  FontRole,
  Button,
  Checkbox,
  Combobox,
  Divider,
  Text,
  TextVariant,
  defaultActionProps,
  useModalFocus,
} from "@xprite/ui";

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
const HINT_HEIGHT = 46;
const ROW_HEIGHT = 24;
const FIELD_LABEL_HEIGHT = 14;
const COMBO_HEIGHT = 30;
const FOOTER_HEIGHT = 34;
const BUTTON_WIDTH = 120;

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
      // "Just shrink" is a one-off choice; persisting it would silently shrink later imports.
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
  const algorithmOptions = getAllAlgorithms().map((algorithm) => ({
    value: algorithm,
    label: tUiSource(algorithmLabelKey(algorithm)),
  }));
  const message = workflow.pixelationError
    ? tUiSource(workflow.pixelationError)
    : pixelate && noteKey
      ? tUiSource(noteKey)
      : tUiSource(pixelate ? "import.dialog.hint.pixelate" : "import.dialog.hint.keep");

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
        const advancedHeight = showAdvanced ? 2 * (FIELD_LABEL_HEIGHT + 2 + COMBO_HEIGHT + GAP) : 0;
        const bottomStack =
          SECTION_HEIGHT +
          4 +
          OPTION_HEIGHT +
          GAP +
          HINT_HEIGHT +
          GAP +
          ROW_HEIGHT +
          GAP +
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
        const hintBounds = at(HINT_HEIGHT, GAP);
        const advancedRow = at(ROW_HEIGHT, GAP);
        const algorithmLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT, 2) : null;
        const algorithmCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
        const pickerLabel = showAdvanced ? at(FIELD_LABEL_HEIGHT, 2) : null;
        const pickerCombo = showAdvanced ? at(COMBO_HEIGHT, GAP) : null;
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
            onClick={() => setAction(value)}
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
            <Text
              variant={TextVariant.Control}
              text={message}
              wrap
              bounds={hintBounds}
              relativeTo={client}
            />
            <Button
              aria-label={tUiSource("import.dialog.advanced")}
              aria-expanded={showAdvanced}
              text={tUiSource("import.dialog.advanced")}
              icon={showAdvanced ? "icon_arrow_down" : undefined}
              selected={showAdvanced}
              disabled={!pixelate}
              onClick={() => setAdvanced((value) => !value)}
              bounds={{ ...advancedRow, width: 120 }}
              relativeTo={client}
            />
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
                  title={tUiSource(algorithmHintKey(selectedAlgorithm))}
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
                  title={tUiSource(colorPickerHintKey(colorPicker))}
                  bounds={pickerCombo}
                  relativeTo={client}
                  value={colorPicker}
                  disabled={
                    workflow.busy || workflow.pixelationOptions.mode !== PixelationMode.RecoverGrid
                  }
                  options={colorPickerOptions}
                  onValueChange={(value) =>
                    workflow.setPixelationOptions({
                      colorPicker: value as CellColorPicker,
                    })
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
