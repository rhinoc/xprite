import { useEffect, useRef, useState, useId } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { FONT_FAMILY_OPTIONS } from "$/components/tools/font-selector";
import { FontOptions } from "$/components/tools/font-selector/font-options";
import { tUiSource } from "$/i18n";
import {
  bitmapTextFontSize,
  normalizeTextFontSize,
  textFontSizeOptions,
} from "$/managers/tools/text-font";
import {
  Button,
  Combobox,
  Divider,
  Input,
  Label,
  focusDialogContainer,
  isDialogPopupTarget,
} from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { centerUiPixel, measureUiText } from "@xprite/ui/assets";
import { sceneViewport } from "@xprite/ui/canvas";
import { clientRect, isImeKeyboardEvent } from "@xprite/ui/utils";
export interface TextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  fontSize: number;
  color: string;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
  antialias?: boolean;
  /** Aseprite client area used for source integer-GUI centering. No OS caption is assumed. */
  clientBounds?: SurfaceBounds;
  disabled?: boolean;
  /** Return an accessible error when the selected font cannot render this text. */
  validateText?: (
    text: string,
    fontName?: string,
    bold?: boolean,
    italic?: boolean,
    fontSize?: number,
    antialias?: boolean,
  ) => string | null;
  onAccept: (
    text: string,
    fontSize: number,
    color: string,
    fontName: string,
    bold: boolean,
    italic: boolean,
    antialias: boolean,
  ) => void;
}

/** paste_text.xml: Text / Font / Color, separator, homogeneous OK + Cancel.
 * Geometry is GUI scale 2: source text minwidth=256, grid/box spacing=4,
 * window border=6/top=17; Input's 7px font + 4px north/south borders.
 * The browser adapter rasterizes the chosen face and styles into the core's bitmap glyphs.
 */
export function TextDialog({
  open,
  onOpenChange,
  text,
  fontSize,
  color,
  fontName = "Aseprite",
  bold = false,
  italic = false,
  antialias = false,
  clientBounds: suppliedClientBounds,
  disabled,
  validateText,
  onAccept,
}: TextDialogProps) {
  const sceneBounds = useSceneBounds();
  const clientBounds = suppliedClientBounds ?? sceneBounds;
  const [draftText, setDraftText] = useState(text);
  const errorId = useId();
  const [draftFontName, setDraftFontName] = useState(fontName);
  const [draftBold, setDraftBold] = useState(bold);
  const [draftItalic, setDraftItalic] = useState(italic);
  const [draftSize, setDraftSize] = useState(fontSize);
  const [draftAntialias, setDraftAntialias] = useState(antialias);
  const invalidText =
    validateText?.(draftText, draftFontName, draftBold, draftItalic, draftSize, draftAntialias) ??
    null;
  const [draftColor, setDraftColor] = useState(color);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<SurfaceBounds>();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({
    text,
    fontSize,
    color,
    fontName,
    bold,
    italic,
    antialias,
    onOpenChange,
    colorOpen,
  });
  latest.current = {
    text,
    fontSize,
    color,
    fontName,
    bold,
    italic,
    antialias,
    onOpenChange,
    colorOpen,
  };
  useEffect(() => {
    if (!open) {
      setPosition(null);
      setColorOpen(false);
      return;
    }
    setDraftText(latest.current.text);
    setDraftSize(latest.current.fontSize);
    setDraftAntialias(latest.current.antialias);
    setDraftColor(latest.current.color);
    setDraftFontName(latest.current.fontName);
    setDraftBold(latest.current.bold);
    setDraftItalic(latest.current.italic);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = () =>
      host.current
        ?.querySelector<HTMLInputElement>('input[data-label-source="Text"]')
        ?.focus({ preventScroll: true });
    first();
    const ownedPopup = (target: EventTarget | null) => isDialogPopupTarget(host.current, target);
    const focus = (event: FocusEvent) => {
      if (
        !latest.current.colorOpen &&
        !host.current?.contains(event.target as Node) &&
        !ownedPopup(event.target)
      )
        focusDialogContainer(host.current);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (ownedPopup(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (latest.current.colorOpen) setColorOpen(false);
        else latest.current.onOpenChange(false);
      }
      if (latest.current.colorOpen) return;
      if (event.key !== "Tab") return;
      const nodes = [
        ...(host.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ];
      const current = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        nodes.length &&
        (current < 0 ||
          (event.shiftKey && current === 0) ||
          (!event.shiftKey && current === nodes.length - 1))
      ) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  const labelWidth = Math.max(
    ...["Text:", "Font:", "Color:"].map((label) => measureUiText(tUiSource(label)) + 4),
  );
  const width = 24 + labelWidth + 8 + 512;
  const height = 212;
  // Window::centerWindow: center in the actual client using integer GUI units.
  const bounds = {
    x: position?.x ?? centerUiPixel(clientBounds.x, clientBounds.width, width),
    y: position?.y ?? centerUiPixel(clientBounds.y, clientBounds.height, height),
    width,
    height,
  };
  const commit = () => {
    // Input commits on blur; read drafts from semantic entries as well so
    // keyboard acceptance never loses the currently focused field's last edit.
    const input = host.current?.querySelector<HTMLInputElement>('input[data-label-source="Text"]');
    const size = host.current?.querySelector<HTMLInputElement>(
      'input[data-label-source="Font Size"]',
    );
    const family = host.current?.querySelector<HTMLInputElement>(
      'input[data-label-source="Font Family"]',
    );
    const sizeValue = Number(size?.value);
    const nextSize =
      Number.isFinite(sizeValue) && sizeValue > 0 ? normalizeTextFontSize(sizeValue) : draftSize;
    const nextText = (input?.value ?? draftText).slice(0, 256);
    const nextFontName = (family?.value ?? draftFontName).trim() || "Aseprite";
    if (
      disabled ||
      validateText?.(nextText, nextFontName, draftBold, draftItalic, nextSize, draftAntialias)
    )
      return;
    onAccept(
      nextText,
      nextSize,
      draftColor,
      nextFontName,
      bitmapTextFontSize(nextFontName) ? false : draftBold,
      draftItalic,
      draftAntialias,
    );
  };
  return (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (isImeKeyboardEvent(event.nativeEvent)) return;
        if (colorOpen) return;
        if (event.altKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          onOpenChange(false);
        } else if (
          (event.altKey && event.key.toLowerCase() === "o") ||
          (event.key === "Enter" && event.target instanceof HTMLInputElement)
        ) {
          event.preventDefault();
          commit();
        }
      }}
    >
      <EditorDialog
        open
        onOpenChange={onOpenChange}
        title="Insert Text"
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
      >
        {({ clientBounds: client }) => {
          const fieldX = client.x + labelWidth + 8;
          const colorBounds = { x: fieldX, y: client.y + 78, width: 128, height: 30 };
          const separator = {
            x: client.x,
            y: client.y + 116,
            width: client.width,
            height: 8,
          };
          const fontBounds = {
            x: fieldX,
            y: client.y + 38,
            width: 330,
            height: 32,
          };
          return (
            <>
              {[
                { text: "Text:", y: 0, h: 30 },
                { text: "Font:", y: 38, h: 32 },
                { text: "Color:", y: 78, h: 30 },
              ].map((row) => (
                <Label
                  key={row.text}
                  text={row.text}
                  bounds={{
                    x: client.x + 2,
                    y: client.y + row.y + Math.floor((row.h - 14) / 2),
                    width: labelWidth - 2,
                    height: 14,
                  }}
                  relativeTo={client}
                />
              ))}
              <Input
                aria-label="Text"
                maxLength={256}
                value={draftText}
                onCommit={setDraftText}
                onInput={(event) => setDraftText(event.currentTarget.value)}
                aria-invalid={invalidText ? true : undefined}
                aria-describedby={invalidText ? errorId : undefined}
                title={invalidText ?? undefined}
                bounds={{ x: fieldX, y: client.y, width: 512, height: 30 }}
                relativeTo={client}
              />
              {invalidText && (
                <span
                  id={errorId}
                  role="status"
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clipPath: "inset(50%)",
                  }}
                >
                  {invalidText}
                </span>
              )}
              <Combobox
                editable
                aria-label="Font Family"
                buttonLabel="Font Family Options"
                title="Choose an installed font or type a font family name"
                disabled={disabled}
                bounds={fontBounds}
                relativeTo={client}
                value={draftFontName}
                options={FONT_FAMILY_OPTIONS}
                onValueChange={(value) => {
                  const family = value.trim() || "Aseprite";
                  setDraftFontName(family);
                  if (bitmapTextFontSize(family)) setDraftBold(false);
                }}
              />
              <Combobox
                editable
                aria-label="Font Size"
                buttonLabel="Font Size Options"
                title="Bitmap font size in pixels; rounded down to an integer scale"
                inputMode="numeric"
                bounds={{
                  x: fieldX + 338,
                  y: client.y + 38,
                  width: 86,
                  height: 32,
                }}
                relativeTo={client}
                value={String(draftSize)}
                options={textFontSizeOptions(draftFontName)}
                onValueChange={(value) => {
                  const number = Number(value);
                  if (Number.isFinite(number) && number > 0)
                    setDraftSize(normalizeTextFontSize(number));
                }}
              />
              {["B", "I"].map((label, index) => (
                <Button
                  key={label}
                  disabled={disabled || (index === 0 && !!bitmapTextFontSize(draftFontName))}
                  aria-label={index === 0 ? "Font Weight" : "Italic"}
                  aria-pressed={index === 0 ? draftBold : draftItalic}
                  selected={index === 0 ? draftBold : draftItalic}
                  text={label}
                  font="mini"
                  part="buttonset_item_normal"
                  bounds={{
                    x: fieldX + 432 + index * 26,
                    y: client.y + 38,
                    width: 28,
                    height: 32,
                  }}
                  relativeTo={client}
                  onClick={() => {
                    if (index === 0) setDraftBold((value) => !value);
                    else if (index === 1) setDraftItalic((value) => !value);
                  }}
                />
              ))}
              <FontOptions
                disabled={disabled}
                antialias={draftAntialias}
                onAntialiasChange={setDraftAntialias}
                bounds={{ x: fieldX + 484, y: client.y + 38, width: 28, height: 32 }}
                relativeTo={client}
              />
              <EditorColorButton
                aria-label="Text Color"
                value={draftColor}
                text={draftColor.slice(0, 7).toLowerCase()}
                bounds={colorBounds}
                relativeTo={client}
                onClick={() => {
                  const trigger = host.current?.querySelector<HTMLElement>(
                    'button[data-label-source="Text Color"]',
                  );
                  const scene = trigger?.closest<HTMLElement>("[data-ui-scene]");
                  if (trigger && scene) {
                    const rect = clientRect(trigger),
                      origin = clientRect(scene);
                    const vp = sceneViewport(scene),
                      sx = vp.width / vp.sceneWidth,
                      sy = vp.height / vp.sceneHeight;
                    setColorAnchor({
                      x: (rect.x - origin.x) / sx,
                      y: (rect.y - origin.y) / sy,
                      width: rect.width / sx,
                      height: rect.height / sy,
                    });
                  } else setColorAnchor(colorBounds);
                  setColorOpen(true);
                }}
              />
              <Divider bounds={separator} relativeTo={client} />
              <Button
                text="OK"
                mnemonicIndex={0}
                font="default"
                part="button_normal"
                hotPart="button_hot"
                focusedPart="button_focused"
                pushedPart="button_selected"
                bounds={{
                  x: client.x + client.width - 248,
                  y: client.y + 132,
                  width: 120,
                  height: 34,
                }}
                relativeTo={client}
                disabled={disabled || !!invalidText}
                onClick={commit}
              />
              <Button
                text="Cancel"
                mnemonicIndex={0}
                font="default"
                part="button_normal"
                hotPart="button_hot"
                focusedPart="button_focused"
                pushedPart="button_selected"
                bounds={{
                  x: client.x + client.width - 120,
                  y: client.y + 132,
                  width: 120,
                  height: 34,
                }}
                relativeTo={client}
                onClick={() => onOpenChange(false)}
              />
            </>
          );
        }}
      </EditorDialog>
      <ColorPicker
        open={colorOpen}
        onOpenChange={setColorOpen}
        title="Text Color"
        value={draftColor}
        onValueChange={setDraftColor}
        anchor={colorAnchor}
      />
    </div>
  );
}
