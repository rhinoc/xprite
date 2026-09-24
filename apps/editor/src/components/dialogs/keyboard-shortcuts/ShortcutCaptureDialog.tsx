import { useState } from "react";

import { EditorDialog } from "$/components/dialogs/overlay";
import { tUiSource } from "$/i18n";
import {
  inputToShortcut,
  normalizeShortcut,
  ShortcutBindingKind,
  type ShortcutDefinition,
} from "$/managers/shortcuts/shortcut-manager";
import { Button, Checkbox, Input, OverlayContentLayout, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/dialogs/keyboard-shortcuts/keyboard-shortcuts.module.css";

const MODIFIERS = ["Ctrl", "Cmd", "Alt", "Shift", "Space"] as const;

export function ShortcutCaptureDialog({
  definition,
  initialShortcut = "",
  conflicts,
  onChange,
  onAccept,
  onCancel,
}: {
  definition: ShortcutDefinition;
  initialShortcut?: string;
  conflicts: readonly ShortcutDefinition[];
  onChange(shortcut: string): void;
  onAccept(shortcut: string): void;
  onCancel(): void;
}) {
  const [shortcut, setShortcut] = useState(initialShortcut);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const modifierBinding =
    definition.kind !== ShortcutBindingKind.Command && definition.kind !== ShortcutBindingKind.Tool;
  const allowKey = modifierBinding && definition.kind !== ShortcutBindingKind.Wheel;
  const valid =
    normalizeShortcut(shortcut, modifierBinding, allowKey) !== null &&
    (!allowKey || shortcut !== "");
  const setValue = (value: string) => {
    setShortcut(value);
    onChange(value);
  };
  const toggleModifier = (modifier: string, checked: boolean) => {
    const keyIsSpace = shortcut === "Space" && !modifierBinding;
    const parts = shortcut
      .split("+")
      .filter(Boolean)
      .filter((part) => part !== modifier || keyIsSpace);
    if (checked) parts.unshift(modifier);
    setValue(normalizeShortcut(parts.join("+"), modifierBinding, allowKey) ?? parts.join("+"));
  };
  return (
    <div className={styles.captureHost}>
      <EditorDialog
        open
        modal
        centerOnOpen
        constrainToViewport
        contentLayout={OverlayContentLayout.Flow}
        title="Select Shortcut"
        defaultBounds={{ x: 0, y: 0, width: 640, height: 290 }}
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
      >
        <div className={styles.captureBody}>
          <Text variant={TextVariant.Inline}>{tUiSource(definition.label)}</Text>
          <div className={styles.captureKeyRow}>
            <Text variant={TextVariant.Inline}>{tUiSource("Key")}</Text>
            <Input
              value={shortcut || (definition.kind === ShortcutBindingKind.Wheel ? "Default" : "")}
              aria-label="Shortcut key"
              readOnly
              autoFocus
              pixelSize={{ width: 160, height: 16 }}
              onKeyDown={(event) => {
                if (
                  event.nativeEvent.isComposing ||
                  event.key === "Process" ||
                  event.key === "Unidentified"
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                if (event.key === " ") setSpaceHeld(true);
                if (event.key === " " && modifierBinding) {
                  setSpaceHeld(true);
                  setValue(
                    [
                      event.ctrlKey ? "Ctrl" : "",
                      event.metaKey ? "Cmd" : "",
                      event.altKey ? "Alt" : "",
                      event.shiftKey ? "Shift" : "",
                      "Space",
                    ]
                      .filter(Boolean)
                      .join("+"),
                  );
                  return;
                }
                setValue(
                  inputToShortcut(
                    {
                      key: event.key,
                      ctrl: event.ctrlKey,
                      meta: event.metaKey,
                      alt: event.altKey,
                      shift: event.shiftKey,
                      space: spaceHeld,
                    },
                    modifierBinding,
                    allowKey,
                  ),
                );
              }}
              onKeyUp={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === " ") setSpaceHeld(false);
              }}
            />
            <Button text="Clear" onClick={() => setValue("")} />
          </div>
          <div className={styles.captureModifiers}>
            <Text variant={TextVariant.Inline}>{tUiSource("Modifiers")}</Text>
            {MODIFIERS.map((modifier) => (
              <Checkbox
                key={modifier}
                label={modifier === "Shift" ? "Shift key" : modifier}
                checked={shortcut.split("+").includes(modifier)}
                onCheckedChange={(checked) => toggleModifier(modifier, checked)}
              />
            ))}
          </div>
          <div className={styles.captureConflict} aria-live="polite">
            <Text variant={TextVariant.Inline}>{tUiSource("Assigned to")}</Text>
            <Text variant={TextVariant.Inline}>
              {conflicts.length
                ? conflicts.map((entry) => tUiSource(entry.label)).join(", ")
                : tUiSource("None")}
            </Text>
            {!!conflicts.length && (
              <Text variant={TextVariant.Inline}>
                {tUiSource("This shortcut will be reassigned.")}
              </Text>
            )}
          </div>
          <div className={styles.captureFooter}>
            <Button text="OK" disabled={!valid} onClick={() => onAccept(shortcut)} />
            <Button text="Cancel" onClick={onCancel} />
          </div>
        </div>
      </EditorDialog>
    </div>
  );
}
