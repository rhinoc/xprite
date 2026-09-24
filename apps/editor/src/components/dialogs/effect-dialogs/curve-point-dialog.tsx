import { useState } from "react";

import { FormDialog } from "$/components/dialogs/form-dialog";
import type { FormLayout } from "$/managers/dialogs/form-layout";
import { evaluateDialogNumber } from "$/managers/dialogs/input-values";
import type { CurveEditorPoint } from "@xprite/ui";

const POINT_DIALOG_WIDTH = 260;
const POINT_DIALOG_LAYOUT: FormLayout = {
  height: 160,
  fields: {
    x: { x: 0, y: 0, width: 236, height: 30, labelWidth: 32 },
    y: { x: 0, y: 34, width: 236, height: 30, labelWidth: 32 },
  },
  actions: {
    OK: { x: 0, y: 80, width: 76, height: 34 },
    Cancel: { x: 80, y: 80, width: 76, height: 34 },
    Delete: { x: 160, y: 80, width: 76, height: 34 },
  },
};

interface CurvePointDialogProps {
  point: CurveEditorPoint;
  canDelete: boolean;
  onAccept(point: CurveEditorPoint): void;
  onDelete(): void;
  onClose(): void;
}

/** Point coordinates remain a draft until the point properties dialog is accepted. */
export function CurvePointDialog({
  point,
  canDelete,
  onAccept,
  onDelete,
  onClose,
}: CurvePointDialogProps) {
  const [coordinates, setCoordinates] = useState({ x: String(point.x), y: String(point.y) });
  const x = evaluateDialogNumber(coordinates.x);
  const y = evaluateDialogNumber(coordinates.y);
  const valid = x !== null && y !== null;
  return (
    <FormDialog
      open
      title="Point Properties"
      width={POINT_DIALOG_WIDTH}
      layout={POINT_DIALOG_LAYOUT}
      selectInitialInput
      submitOnEnter={valid}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      fields={(["x", "y"] as const).map((coordinate) => ({
        key: coordinate,
        type: "text",
        label: coordinate === "x" ? "X:" : "Y:",
        value: coordinates[coordinate],
        onChange: (value: string) => setCoordinates((old) => ({ ...old, [coordinate]: value })),
      }))}
      actions={[
        {
          label: "OK",
          disabled: !valid,
          onClick: () => {
            if (valid) onAccept({ x, y });
          },
        },
        { label: "Cancel", onClick: onClose },
        { label: "Delete", disabled: !canDelete, onClick: onDelete },
      ]}
    />
  );
}
