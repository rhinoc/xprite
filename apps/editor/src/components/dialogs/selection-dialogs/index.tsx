import { useEffect, useRef, useState } from "react";

import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { SelectionModeControl } from "$/components/tools/selection-mode-control";
import { tUi, tUiSource } from "$/i18n";
import {
  formatEditorColor,
  parseEditorColor,
  TOOL_COLOR_CHANNEL_MAX,
  type EditorColor,
} from "$/managers/tools/color-control";
import { ToolSelectionMode, ToolSelectionModifier } from "$/managers/tools/tool-options";
import { Button, Input, Label, isDialogPopupTarget } from "@xprite/ui";
import { Checkbox, CheckboxVariant } from "@xprite/ui";
import { Divider } from "@xprite/ui";
import { Slider } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

export interface SelectionDialogValues {
  operation: ToolSelectionModifier;
  quantity: number;
  brush: "circle" | "square";
}
export interface ColorRangeValues {
  color: EditorColor;
  tolerance: number;
  mode: ToolSelectionMode;
  preview: boolean;
}
export type SelectionDialogKind = ToolSelectionModifier | "color-range" | null;
export interface SelectionDialogsProps {
  kind: SelectionDialogKind;
  onClose: () => void;
  foreground: EditorColor;
  selectionMode?: ToolSelectionMode;
  onModify: (values: SelectionDialogValues) => void;
  onColorRange: (values: ColorRangeValues) => void;
  /** Preview must not replace the committed mask/history; null restores it. */
  onPreview?: (values: ColorRangeValues | null) => void;
}
/** Aseprite modify_selection.xml / MaskByColorWindow layout and shared control behavior. */
export function SelectionDialogs({
  kind,
  onClose,
  foreground,
  selectionMode = ToolSelectionMode.Replace,
  onModify,
  onColorRange,
  onPreview,
}: SelectionDialogsProps) {
  const initializeFocus = useEditorDialogInitialFocus();
  const [quantity, setQuantity] = useState("1"),
    [brush, setBrush] = useState<"circle" | "square">("circle");
  const [color, setColor] = useState<EditorColor>(foreground),
    [tolerance, setTolerance] = useState(0),
    [mode, setMode] = useState<ToolSelectionMode>(selectionMode),
    [preview, setPreview] = useState(true),
    [picker, setPicker] = useState<SurfaceBounds | null>(null);
  const committedColorRange = useRef({ tolerance: 0, preview: true });
  const committedModify = useRef({ quantity: "1", brush: "circle" as "circle" | "square" });
  const host = useRef<HTMLDivElement>(null),
    previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => {
    if (kind === "color-range") {
      setColor(foreground);
      setMode(selectionMode);
      setTolerance(committedColorRange.current.tolerance);
      setPreview(committedColorRange.current.preview);
    } else if (kind) {
      setQuantity(committedModify.current.quantity);
      setBrush(committedModify.current.brush);
    }
    setPicker(null);
  }, [kind]);
  useEffect(() => {
    if (kind === "color-range")
      previewRef.current?.(preview ? { color, tolerance, mode, preview } : null);
    return () => previewRef.current?.(null);
  }, [kind, color, tolerance, mode, preview]);
  useEffect(() => {
    if (kind) {
      if (kind === "color-range")
        host.current?.querySelector<HTMLButtonElement>('button[data-label-source="OK"]')?.focus();
      else initializeFocus(host.current, { selectText: true });
    }
  }, [kind, initializeFocus]);
  if (!kind) return null;
  const isColor = kind === "color-range",
    label = isColor
      ? "Select Color"
      : tUi("ui.selection.2", { value1: tUiSource(kind[0].toUpperCase() + kind.slice(1)) });
  const byLabel =
    kind === ToolSelectionModifier.Border
      ? "Width:"
      : tUi("ui.by.2", { value1: tUiSource(kind[0].toUpperCase() + kind.slice(1)) });
  // Aseprite Grid: label border adds two GUI pixels; radios determine column width.
  const labelWidth = measureUiText(byLabel) + 4;
  const modifyContentWidth = Math.max(248, labelWidth + 8 + 148);
  const modifyEntryX = labelWidth + 8;
  const modifyEntryWidth = modifyContentWidth - modifyEntryX;
  const modifyOkWidth = Math.floor((modifyContentWidth - 8) / 4) * 2;
  const close = () => {
    previewRef.current?.(null);
    onClose();
  };
  const accept = () => {
    previewRef.current?.(null);
    if (isColor) {
      committedColorRange.current = { tolerance, preview };
      onColorRange({ color, tolerance, mode, preview });
    } else {
      const value = Math.max(1, Math.min(100, Math.round(Number(quantity) || 1)));
      committedModify.current = { quantity: String(value), brush };
      onModify({ operation: kind, quantity: value, brush });
    }
    onClose();
  };
  return (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          isImeKeyboardEvent(event.nativeEvent) ||
          isDialogPopupTarget(host.current, event.target)
        )
          return;
        if (!picker && event.altKey) {
          const key = event.key.toLowerCase();
          if (key === "o") {
            event.preventDefault();
            accept();
            return;
          }
          if (key === "c") {
            event.preventDefault();
            close();
            return;
          }
          if (key === "p" && isColor) {
            event.preventDefault();
            setPreview((value) => !value);
            return;
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        if (event.key === "Enter" && !picker) {
          event.preventDefault();
          accept();
        }
        if (event.key === "Tab") {
          const nodes = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled)",
              ),
            ],
            i = nodes.indexOf(document.activeElement as HTMLElement);
          if (
            nodes.length &&
            (i < 0 || (event.shiftKey && i === 0) || (!event.shiftKey && i === nodes.length - 1))
          ) {
            event.preventDefault();
            nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
          }
        }
      }}
    >
      <EditorDialog
        open
        centerOnOpen
        title={label}
        defaultBounds={{
          x: 800,
          y: 410,
          width: isColor ? 210 : modifyContentWidth + 24,
          height: isColor ? 230 : 198,
        }}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
      >
        {({ clientBounds: c }) => (
          <>
            {isColor ? (
              <>
                <SelectionModeControl
                  mode={mode}
                  onChange={setMode}
                  x={c.x}
                  y={c.y}
                  relativeTo={c}
                  width={186}
                />
                <Label
                  bounds={{ x: c.x + 2, y: c.y + 40, width: 48, height: 30 }}
                  relativeTo={c}
                  text="Color:"
                />
                <EditorColorButton
                  bounds={{ x: c.x + 58, y: c.y + 40, width: 128, height: 30 }}
                  relativeTo={c}
                  value={formatEditorColor(color)}
                  aria-label="Color"
                  onClick={() => setPicker({ x: c.x + 58, y: c.y + 40, width: 128, height: 30 })}
                />
                <Label
                  bounds={{ x: c.x + 2, y: c.y + 78, width: 90, height: 32 }}
                  relativeTo={c}
                  text="Tolerance:"
                />
                <Slider
                  bounds={{ x: c.x + 100, y: c.y + 78, width: 86, height: 32 }}
                  relativeTo={c}
                  min={0}
                  max={TOOL_COLOR_CHANNEL_MAX}
                  value={tolerance}
                  onValueChange={setTolerance}
                  aria-label="Tolerance"
                />
                <Checkbox
                  bounds={{ x: c.x, y: c.y + 118, width: 186, height: 24 }}
                  relativeTo={c}
                  label="Preview"
                  mnemonicIndex={0}
                  checked={preview}
                  onCheckedChange={setPreview}
                />
              </>
            ) : (
              <>
                <Label
                  bounds={{ x: c.x + 2, y: c.y, width: labelWidth - 2, height: 30 }}
                  relativeTo={c}
                  text={byLabel}
                />
                <Input
                  bounds={{ x: c.x + modifyEntryX, y: c.y, width: modifyEntryWidth, height: 30 }}
                  relativeTo={c}
                  value={quantity}
                  suffix="px"
                  inputMode="numeric"
                  aria-label={
                    kind === ToolSelectionModifier.Border
                      ? tUiSource("Width")
                      : tUi("ui.by", { value1: tUiSource(kind) })
                  }
                  onValueChange={setQuantity}
                />
                <Checkbox
                  variant={CheckboxVariant.Radio}
                  bounds={{
                    x: c.x + modifyEntryX,
                    y: c.y + 38,
                    width: modifyEntryWidth,
                    height: 24,
                  }}
                  relativeTo={c}
                  label="Circle Brush"
                  checked={brush === "circle"}
                  onCheckedChange={() => setBrush("circle")}
                />
                <Checkbox
                  variant={CheckboxVariant.Radio}
                  bounds={{
                    x: c.x + modifyEntryX,
                    y: c.y + 70,
                    width: modifyEntryWidth,
                    height: 24,
                  }}
                  relativeTo={c}
                  label="Square Brush"
                  checked={brush === "square"}
                  onCheckedChange={() => setBrush("square")}
                />
              </>
            )}
            {!isColor && (
              <Divider
                bounds={{ x: c.x, y: c.y + 102, width: modifyContentWidth, height: 8 }}
                relativeTo={c}
              />
            )}
            <Button
              bounds={{
                x: c.x,
                y: c.y + (isColor ? 150 : 118),
                width: isColor ? 88 : modifyOkWidth,
                height: 34,
              }}
              relativeTo={c}
              part="button_normal"
              hotPart="button_hot"
              focusedPart="button_focused"
              pushedPart="button_selected"
              focusAppearance={isColor ? "always" : "keyboard"}
              text="OK"
              font="default"
              mnemonicIndex={0}
              aria-label="OK"
              onClick={accept}
            />
            <Button
              bounds={{
                x: c.x + (isColor ? 96 : modifyOkWidth + 8),
                y: c.y + (isColor ? 150 : 118),
                width: isColor ? 90 : modifyContentWidth - modifyOkWidth - 8,
                height: 34,
              }}
              relativeTo={c}
              part="button_normal"
              hotPart="button_hot"
              focusedPart="button_focused"
              pushedPart="button_selected"
              text="Cancel"
              font="default"
              mnemonicIndex={0}
              aria-label="Cancel"
              onClick={close}
            />
          </>
        )}
      </EditorDialog>
      <ColorPicker
        open={!!picker}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        value={formatEditorColor(color)}
        onValueChange={(value) => setColor(parseEditorColor(value))}
        anchor={picker ?? undefined}
      />
    </div>
  );
}
