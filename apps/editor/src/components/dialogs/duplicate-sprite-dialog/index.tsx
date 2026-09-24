import { useEffect, useState } from "react";

import { FormDialog } from "$/components/dialogs/form-dialog";
import { duplicateSpriteAsepriteLayout } from "$/managers/sprites/duplicate-sprite-geometry";

export interface DuplicateSpriteOptions {
  name: string;
  flatten: boolean;
}
export interface DuplicateSpriteDialogProps {
  open: boolean;
  sourceName: string;
  suggestedName: string;
  initialFlatten?: boolean;
  onClose: () => void;
  onDuplicate: (options: DuplicateSpriteOptions) => void;
}

/** Source-shaped Duplicate Sprite form; cloning and optional merging stay in the caller. */
export function DuplicateSpriteDialog({
  open,
  sourceName,
  suggestedName,
  initialFlatten = false,
  onClose,
  onDuplicate,
}: DuplicateSpriteDialogProps) {
  const [name, setName] = useState(suggestedName),
    [flatten, setFlatten] = useState(initialFlatten);
  useEffect(() => {
    if (open) {
      setName(suggestedName);
      setFlatten(initialFlatten);
    }
  }, [open, suggestedName, initialFlatten]);
  const accept = () => {
    const value = name.trim();
    if (!value) return;
    onDuplicate({ name: value, flatten });
    onClose();
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title="Duplicate Sprite"
      width={406}
      layout={duplicateSpriteAsepriteLayout}
      fields={[
        { key: "duplicate", type: "label", label: "Duplicate:" },
        { key: "source", type: "label", label: sourceName },
        { key: "as", type: "label", label: "As:" },
        { key: "destination", type: "text", label: "", value: name, onChange: setName },
        {
          key: "flatten",
          type: "checkbox",
          label: "Duplicate merged layers only",
          value: flatten,
          onChange: setFlatten,
        },
      ]}
      actions={[
        { label: "OK", disabled: !name.trim(), onClick: accept },
        { label: "Cancel", onClick: onClose },
      ]}
    />
  );
}
