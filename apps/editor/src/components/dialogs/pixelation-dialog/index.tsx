import { useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { tUiSource, useUiLanguage } from "$/i18n";
import {
  getAllAlgorithms,
  ImportDialogChoice,
  PixelArtClassification,
  PixelationAlgorithm,
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
const BOUNDS = { x: 0, y: 0, width: 780, height: 800 };
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
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(PixelationAlgorithm.Auto);
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

  const handleAcceptOriginal = () => {
    if (rememberChoice) {
      const currentPreferences = workflow.getFilePreferences();
      workflow.setFilePreferences({
        ...currentPreferences,
        importDialogChoice: ImportDialogChoice.AlwaysImportAsIs,
      });
    }
    workflow.acceptOriginalImport();
  };

  const handleAcceptPixelated = () => {
    if (rememberChoice) {
      const currentPreferences = workflow.getFilePreferences();
      workflow.setFilePreferences({
        ...currentPreferences,
        importDialogChoice: ImportDialogChoice.AlwaysPixelate,
        importPixelationAlgorithm: selectedAlgorithm,
      });
    }
    workflow.acceptPixelatedImport();
  };

  const algorithmOptions = getAllAlgorithms().map((algorithm) => ({
    value: algorithm,
    label: tUiSource(`import.algorithm.${algorithm}`),
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
        <Text variant={TextVariant.Reading} wrap className={styles.useCaseDescription}>
          {getUseCaseDescription()}
        </Text>

        <Field label={tUiSource("import.dialog.algorithm")} layout={FieldLayout.Inline}>
          <Combobox
            pixelWidth={200}
            value={selectedAlgorithm}
            aria-label={tUiSource("import.dialog.algorithm")}
            disabled={workflow.busy}
            options={algorithmOptions}
            onValueChange={(value) => setSelectedAlgorithm(value as PixelationAlgorithm)}
          />
        </Field>

        <div className={styles.preview}>
          <PixelationComparison
            stacked
            mode={workflow.pixelationOptions.mode}
            source={pending.pixels}
            result={workflow.pixelationPreview}
            preparing={workflow.pixelationPreviewing}
            translate={tUiSource}
          />
        </div>
        <div className={styles.settings}>
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
        {workflow.pixelationError && (
          <Text variant={TextVariant.Reading} role="alert" wrap>
            {tUiSource(workflow.pixelationError)}
          </Text>
        )}
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
            text={tUiSource("import.dialog.pixelate.with")}
            disabled={workflow.busy || workflow.pixelationPreviewing || !workflow.pixelationPreview}
            onClick={handleAcceptPixelated}
          />
        </ControlFlow>
      </div>
    </EditorDialog>
  );
}
