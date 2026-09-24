import { useEffect, useRef, type ReactNode } from "react";

import { EditorDialog } from "$/components/dialogs/overlay";
import { tUi, tUiSource } from "$/i18n";
import { DialogEffectTarget } from "$/managers/dialogs/effect-dialog-manager";
import { Button, isDialogPopupTarget } from "@xprite/ui";
import { Checkbox } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { isImeKeyboardEvent } from "@xprite/ui/utils";
export interface EditorFilterWindowProps {
  title: string;
  depth?: 8 | 16 | 32;
  bodyWidth: number;
  bodyHeight?: number;
  channels: number;
  alphaEnabled?: boolean;
  target: DialogEffectTarget;
  preview: boolean;
  tiled?: boolean;
  onChannels: (channels: number) => void;
  onTarget: (target: DialogEffectTarget) => void;
  onPreview: (enabled: boolean) => void;
  onTiled?: (enabled: boolean) => void;
  onApply: () => void;
  onAccept: () => void;
  onCancel: () => void;
  children: (bounds: SurfaceBounds) => ReactNode;
}
/** Aseprite FilterWindow right-hand control column shared by every filter. */
export function EditorFilterWindow({
  title,
  depth = 32,
  bodyWidth,
  bodyHeight = 212,
  channels,
  alphaEnabled = true,
  target,
  preview,
  tiled,
  onChannels,
  onTarget,
  onPreview,
  onTiled,
  onApply,
  onAccept,
  onCancel,
  children,
}: EditorFilterWindowProps) {
  const host = useRef<HTMLDivElement>(null),
    height = Math.max(bodyHeight, (tiled === undefined ? 212 : 244) + (depth === 8 ? 24 : 0));
  useEffect(() => {
    host.current
      ?.querySelector<HTMLButtonElement>('button[data-label-source="OK"]')
      ?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (isImeKeyboardEvent(e.nativeEvent) || isDialogPopupTarget(host.current, e.target))
          return;
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
          return;
        }
        if (e.key === "Enter" && !e.defaultPrevented) {
          e.preventDefault();
          onAccept();
          return;
        }
        if (e.altKey) {
          const key = e.key.toLowerCase();
          if (key === "o") {
            e.preventDefault();
            onAccept();
          }
          if (key === "a") {
            e.preventDefault();
            onApply();
          }
          if (key === "c") {
            e.preventDefault();
            onCancel();
          }
          if (key === "p") {
            e.preventDefault();
            onPreview(!preview);
          }
        }
        if (e.key === "Tab") {
          const nodes = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),[role="slider"],[tabindex="0"]',
              ),
            ],
            at = nodes.indexOf(document.activeElement as HTMLElement);
          if (
            nodes.length &&
            (at < 0 || (e.shiftKey && at === 0) || (!e.shiftKey && at === nodes.length - 1))
          ) {
            e.preventDefault();
            nodes[e.shiftKey ? nodes.length - 1 : 0].focus();
          }
        }
      }}
    >
      <EditorDialog
        open
        centerOnOpen
        title={title}
        defaultBounds={{ x: 0, y: 0, width: bodyWidth + 132, height: height + 46 }}
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
        autoFocus={false}
        modal
        resizable={false}
        constrainToViewport
      >
        {({ clientBounds: c }) => {
          const x = c.x + bodyWidth + 8;
          return (
            <>
              {children({ ...c, width: bodyWidth })}
              {(["OK", "Apply", "Cancel"] as const).map((label, i) => (
                <Button
                  key={label}
                  bounds={{ x, y: c.y + i * 42, width: 100, height: 34 }}
                  relativeTo={c}
                  text={label}
                  font="default"
                  mnemonicIndex={0}
                  focusAppearance="always"
                  part="button_normal"
                  hotPart="button_hot"
                  focusedPart="button_focused"
                  pushedPart="button_selected"
                  aria-label={label}
                  onClick={i === 0 ? onAccept : i === 1 ? onApply : onCancel}
                />
              ))}
              {(depth === 16
                ? [
                    { label: "K", bit: 16, x: 0, w: 50 },
                    { label: "A", bit: 8, x: 48, w: 52 },
                  ]
                : ["R", "G", "B", "A"].map((label, i) => ({
                    label,
                    bit: 1 << i,
                    x: i * 24,
                    w: i === 3 ? 28 : 26,
                  }))
              ).map(({ label, bit, x: offset, w }) => (
                <Button
                  key={label}
                  bounds={{ x: x + offset, y: c.y + 126, width: w, height: 30 }}
                  relativeTo={c}
                  text={label}
                  font="mini"
                  selected={!!(channels & bit)}
                  disabled={bit === 8 && !alphaEnabled}
                  aria-label={tUi("ui.modify.channel", { value1: tUiSource(label) })}
                  onClick={() => onChannels((channels & ~32) ^ bit)}
                />
              ))}
              {depth === 8 && (
                <Button
                  bounds={{ x, y: c.y + 150, width: 100, height: 30 }}
                  relativeTo={c}
                  text="Index"
                  font="mini"
                  selected={!!(channels & 32)}
                  aria-label="Modify index channel"
                  onClick={() => onChannels(channels & 32 ? 0 : 32)}
                />
              )}
              <Button
                bounds={{ x, y: c.y + 150 + (depth === 8 ? 24 : 0), width: 100, height: 30 }}
                relativeTo={c}
                text={target === DialogEffectTarget.All ? "All" : "Selected"}
                font="mini"
                aria-label="Filter cel target"
                onClick={() =>
                  onTarget(
                    target === DialogEffectTarget.All
                      ? DialogEffectTarget.Selected
                      : DialogEffectTarget.All,
                  )
                }
              />
              <Checkbox
                bounds={{ x, y: c.y + 188 + (depth === 8 ? 24 : 0), width: 100, height: 24 }}
                relativeTo={c}
                label="Preview"
                mnemonicIndex={0}
                checked={preview}
                onCheckedChange={onPreview}
              />
              {tiled !== undefined && (
                <Checkbox
                  bounds={{ x, y: c.y + 220 + (depth === 8 ? 24 : 0), width: 100, height: 24 }}
                  relativeTo={c}
                  label="Tiled"
                  mnemonicIndex={0}
                  checked={tiled}
                  onCheckedChange={onTiled ?? (() => {})}
                />
              )}
            </>
          );
        }}
      </EditorDialog>
    </div>
  );
}
