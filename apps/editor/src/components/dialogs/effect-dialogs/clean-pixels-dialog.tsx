import { useEffect, useId, useMemo, useRef, useState } from "react";

import { EditorFilterWindow } from "$/components/dialogs/filter-window";
import { tUi } from "$/i18n";
import {
  DIALOG_CLEAN_PIXELS_KIND,
  DialogCleanupPass,
  type DialogCleanupAvailability,
  type DialogCleanupOptions,
  type DialogCleanupSpec,
  type DialogEffectTarget,
} from "$/managers/dialogs/effect-dialog-manager";
import { useEffectDialogPreferences } from "$/managers/preferences/use-effect-dialog-preferences";
import { Checkbox, FontRole, Text, TextVariant } from "@xprite/ui";

const BODY_WIDTH = 326;
const BODY_HEIGHT = 188;
const ROW_HEIGHT = 34;
const ROW_GAP = 4;
const HINT_INDENT = 28;
const CLEANUP_ROWS = [
  { pass: DialogCleanupPass.RemoveOrphans, label: "Remove orphan pixels" },
  { pass: DialogCleanupPass.CleanDoubles, label: "Clean doubles" },
  { pass: DialogCleanupPass.SnapToPalette, label: "Snap to palette" },
  { pass: DialogCleanupPass.CrispAlpha, label: "Crisp alpha" },
] as const;

interface CleanPixelsDialogProps {
  availabilityFor: (target: DialogEffectTarget) => DialogCleanupAvailability;
  onPreview: (spec: DialogCleanupSpec | null, target: DialogEffectTarget) => void;
  onApply: (spec: DialogCleanupSpec, target: DialogEffectTarget) => void;
  onClose: () => void;
}

export function CleanPixelsDialog({
  availabilityFor,
  onPreview,
  onApply,
  onClose,
}: CleanPixelsDialogProps) {
  const preferences = useEffectDialogPreferences();
  const [target, setTarget] = useState(preferences.target);
  const [preview, setPreview] = useState(preferences.preview[DIALOG_CLEAN_PIXELS_KIND] ?? true);
  const [initialPosition] = useState(() => preferences.windowPosition(DIALOG_CLEAN_PIXELS_KIND));
  const [options, setOptions] = useState<DialogCleanupOptions>({});
  const [applied, setApplied] = useState(0);
  const alphaHintId = useId();
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const { cleanDoubles, snapToPalette, crispAlpha } = useMemo(
    () => availabilityFor(target),
    [availabilityFor, target],
  );
  const available = { removeOrphans: true, cleanDoubles, snapToPalette, crispAlpha };
  const spec = useMemo<DialogCleanupSpec>(
    () => ({
      kind: DIALOG_CLEAN_PIXELS_KIND,
      options: {
        removeOrphans: options.removeOrphans,
        cleanDoubles: cleanDoubles && options.cleanDoubles,
        snapToPalette: snapToPalette && options.snapToPalette,
        crispAlpha: crispAlpha && options.crispAlpha,
      },
    }),
    [options, cleanDoubles, snapToPalette, crispAlpha],
  );
  useEffect(() => {
    previewRef.current(preview ? spec : null, target);
    return () => previewRef.current(null, target);
  }, [spec, target, preview, applied]);
  useEffect(() => {
    preferences.remember(target, DIALOG_CLEAN_PIXELS_KIND, preview, spec);
  }, [target, preview, spec, preferences]);

  return (
    <EditorFilterWindow
      title="Clean Pixels"
      bodyWidth={BODY_WIDTH}
      bodyHeight={BODY_HEIGHT}
      initialPosition={initialPosition}
      onPositionChange={(position) =>
        preferences.rememberWindowPosition(DIALOG_CLEAN_PIXELS_KIND, position)
      }
      target={target}
      preview={preview}
      onTarget={setTarget}
      onPreview={setPreview}
      onApply={() => {
        onApply(spec, target);
        setApplied((value) => value + 1);
      }}
      onAccept={() => {
        onApply(spec, target);
        onClose();
      }}
      onCancel={onClose}
    >
      {(c) => (
        <>
          {CLEANUP_ROWS.map(({ pass, label }, index) => (
            <Checkbox
              key={pass}
              bounds={{
                x: c.x,
                y: c.y + index * (ROW_HEIGHT + ROW_GAP),
                width: c.width,
                height: ROW_HEIGHT,
              }}
              relativeTo={c}
              label={label}
              checked={!!spec.options[pass]}
              disabled={!available[pass]}
              aria-describedby={
                pass === DialogCleanupPass.CrispAlpha && !crispAlpha ? alphaHintId : undefined
              }
              onCheckedChange={(checked) => setOptions((old) => ({ ...old, [pass]: checked }))}
            />
          ))}
          {!crispAlpha && (
            <Text
              id={alphaHintId}
              variant={TextVariant.Control}
              bounds={{
                x: c.x + HINT_INDENT,
                y: c.y + CLEANUP_ROWS.length * (ROW_HEIGHT + ROW_GAP),
                width: c.width - HINT_INDENT,
                height: ROW_HEIGHT,
              }}
              relativeTo={c}
              font={FontRole.Compact}
              text={tUi("ui.no.semi.transparent.pixels.in.the.target")}
              wrap
            />
          )}
        </>
      )}
    </EditorFilterWindow>
  );
}
