import { useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { tUiSource, useUiLanguage } from "$/i18n";
import type { useEditorWorkflows } from "$/managers/workspace/use-editor-workflows";
import {
  PixelationControls,
  PixelationComparison,
  pixelationDialogLabels,
} from "@xprite/editor-ui";
import {
  Button,
  ControlFlow,
  OverlayContentLayout,
  Text,
  TextVariant,
  useModalFocus,
} from "@xprite/ui";

import styles from "$/components/dialogs/pixelation-dialog/pixelation-dialog.module.css";
const BOUNDS = { x: 0, y: 0, width: 780, height: 760 };
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
  const labels = pixelationDialogLabels(workflow.pixelationOptions);
  const rootRef = useModalFocus(!!pending, workflow.discardEmptyImport);
  if (!pending) return null;
  return (
    <EditorDialog
      open
      onRootRef={rootRef}
      modal
      centerOnOpen
      constrainToViewport
      contentLayout={OverlayContentLayout.Flow}
      title={tUiSource(labels.title)}
      defaultBounds={BOUNDS}
      onOpenChange={(open) => {
        if (!open) workflow.discardEmptyImport();
      }}
    >
      <div className={styles.body}>
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
        <ControlFlow className={styles.actions}>
          <Button slots={{}} text={tUiSource("Cancel")} onClick={workflow.discardEmptyImport} />
          <Button
            slots={{}}
            text={tUiSource("Keep original")}
            disabled={workflow.busy}
            onClick={workflow.acceptOriginalImport}
          />
          <Button
            slots={{}}
            text={tUiSource(labels.apply)}
            disabled={workflow.busy || workflow.pixelationPreviewing || !workflow.pixelationPreview}
            onClick={workflow.acceptPixelatedImport}
          />
        </ControlFlow>
      </div>
    </EditorDialog>
  );
}
