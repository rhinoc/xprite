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
import { tUiSource, useUiLanguage } from "$/i18n";
import {
  getAllAlgorithms,
  getAllColorPickers,
  type ImportAction,
  PixelArtClassification,
  PixelationAlgorithm,
  PixelationMode,
  CellColorPicker,
} from "$/managers/preferences/file-preferences";
import type { useEditorWorkflows } from "$/managers/workspace/use-editor-workflows";
import { PixelationControls, PixelationComparison } from "@xprite/editor-ui";
import {
  Button,
  Checkbox,
  Combobox,
  ControlFlow,
  Field,
  FieldLayout,
  OverlayContentLayout,
  Text,
  TextVariant,
  useModalFocus,
} from "@xprite/ui";

import styles from "$/components/dialogs/pixelation-dialog/pixelation-dialog.module.css";
const BOUNDS = { x: 0, y: 0, width: 780, height: 480 };
const ALGORITHM_WIDTH = 210;
type Workflow = Pick<
  ReturnType<typeof useEditorWorkflows>,
  | "pending"
  | "pixelationOptions"
  | "pixelationPalette"
  | "getPixelationPaletteChoices"
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
export function PixelationDialog({ workflow }: { workflow: Workflow }) {
  useUiLanguage();
  const pending = workflow.pending;
  const sceneBounds = useSceneBounds();
  const [choices, setChoices] = useState(workflow.getPixelationPaletteChoices);
  const [rememberChoice, setRememberChoice] = useState(false);
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
  const selectedAlgorithm = pending.algorithm;
  const noteKey = algorithmNoteKey(selectedAlgorithm, !!pending.grid?.reliable);

  // Determine use case description based on classification and grid detection
  const getUseCaseDescription = () => {
    if (pending.grid?.reliable) {
      return tUiSource("import.dialog.detected.pixel.art");
    }
    if (pending.classification === PixelArtClassification.LikelyPixelArt) {
      return tUiSource("import.dialog.upscaled.or.ai");
    }
    return tUiSource("import.dialog.plain.image");
  };

  /** Every confirmed pick becomes the default next time; the checkbox only turns the question off. */
  const rememberPicks = (action: ImportAction) =>
    workflow.setFilePreferences({
      ...workflow.getFilePreferences(),
      importLastAction: action,
      importPixelationAlgorithm: selectedAlgorithm,
      importColorPicker: workflow.pixelationOptions.colorPicker,
      ...(rememberChoice ? { importAsk: false } : {}),
    });
  const handleAcceptOriginal = () => {
    rememberPicks("import-as-is");
    workflow.acceptOriginalImport();
  };
  const handleAcceptPixelated = () => {
    rememberPicks("pixelate");
    workflow.acceptPixelatedImport();
  };

  const colorPickerOptions = getAllColorPickers().map((picker) => ({
    value: picker,
    label: tUiSource(colorPickerLabelKey(picker)),
  }));
  const algorithmOptions = getAllAlgorithms().map((algorithm) => ({
    value: algorithm,
    label: tUiSource(algorithmLabelKey(algorithm)),
  }));

  return (
    <EditorDialog
      open
      onRootRef={(node) => {
        rootRef.current = node;
      }}
      modal
      centerOnOpen
      constrainToViewport
      contentLayout={OverlayContentLayout.Flow}
      title={tUiSource("import.dialog.title")}
      defaultBounds={BOUNDS}
      onOpenChange={(open) => {
        if (!open) workflow.discardEmptyImport();
      }}
    >
      <div className={styles.body}>
        <div className={styles.content}>
          <Text variant={TextVariant.Reading} wrap className={styles.useCaseDescription}>
            {getUseCaseDescription()}
          </Text>
          <div className={styles.settings}>
            <Field label={tUiSource("import.dialog.algorithm")} layout={FieldLayout.Inline}>
              <Combobox
                pixelWidth={ALGORITHM_WIDTH}
                value={selectedAlgorithm}
                aria-label={tUiSource("import.dialog.algorithm")}
                disabled={workflow.busy}
                options={algorithmOptions}
                onValueChange={(value) => workflow.setImportAlgorithm(value as PixelationAlgorithm)}
              />
            </Field>
            <Text variant={TextVariant.Reading} wrap>
              {tUiSource(algorithmHintKey(selectedAlgorithm))}
            </Text>
            <Field label={tUiSource("import.dialog.color.picker")} layout={FieldLayout.Inline}>
              <Combobox
                pixelWidth={ALGORITHM_WIDTH}
                value={workflow.pixelationOptions.colorPicker}
                aria-label={tUiSource("import.dialog.color.picker")}
                disabled={
                  workflow.busy || workflow.pixelationOptions.mode !== PixelationMode.RecoverGrid
                }
                options={colorPickerOptions}
                onValueChange={(value) =>
                  workflow.setPixelationOptions({ colorPicker: value as CellColorPicker })
                }
              />
            </Field>
            <Text variant={TextVariant.Reading} wrap>
              {tUiSource(colorPickerHintKey(workflow.pixelationOptions.colorPicker))}
            </Text>
            {noteKey && (
              <Text variant={TextVariant.Reading} role="status" wrap>
                {tUiSource(noteKey)}
              </Text>
            )}
            <PixelationControls
              paletteResources={{
                choices,
                currentPalette: pending.sourcePalette,
                previewPalette: workflow.pixelationPalette,
                currentLabel: "Use current palette",
                currentName: "Current palette",
                sceneBounds,
                refresh: () => setChoices(workflow.getPixelationPaletteChoices()),
              }}
              grid={pending.grid ?? undefined}
              settings={workflow.pixelationOptions}
              sourceSize={pending.pixels}
              onChange={workflow.setPixelationOptions}
              disabled={workflow.busy}
              translate={tUiSource}
            />
          </div>
          <div className={styles.preview}>
            <PixelationComparison
              mode={workflow.pixelationOptions.mode}
              source={pending.pixels}
              result={workflow.pixelationPreview}
              preparing={workflow.pixelationPreviewing}
              translate={tUiSource}
            />
          </div>
          {workflow.pixelationError && (
            <Text
              variant={TextVariant.Reading}
              role="alert"
              wrap
              className={styles.useCaseDescription}
            >
              {tUiSource(workflow.pixelationError)}
            </Text>
          )}
        </div>
        <div className={styles.footer}>
          <Checkbox
            label={tUiSource("import.dialog.remember")}
            checked={rememberChoice}
            onCheckedChange={setRememberChoice}
          />
          <ControlFlow className={styles.actions}>
            <Button slots={{}} text={tUiSource("Cancel")} onClick={workflow.discardEmptyImport} />
            <Button
              slots={{}}
              text={tUiSource("import.dialog.import.as.is")}
              disabled={workflow.busy}
              onClick={handleAcceptOriginal}
            />
            <Button
              slots={{}}
              text={tUiSource("import.dialog.pixelate")}
              disabled={
                workflow.busy || workflow.pixelationPreviewing || !workflow.pixelationPreview
              }
              onClick={handleAcceptPixelated}
            />
          </ControlFlow>
        </div>
      </div>
    </EditorDialog>
  );
}
