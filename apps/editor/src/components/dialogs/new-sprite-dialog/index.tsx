import { useEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { tUi } from "$/i18n";
import {
  DIALOG_IMAGE_DIMENSION_MAX,
  parseNewSpriteDimension,
  useDialogInputPreferences,
} from "$/managers/dialogs/input-values";
import {
  Button,
  ButtonVariant,
  Checkbox,
  Combobox,
  Divider,
  Input,
  focusDialogContainer,
  isDialogPopupTarget,
  type SurfaceBounds,
  Text,
  TextVariant,
} from "@xprite/ui";
import { centerUiPixel, UiIcon, useUiAssets } from "@xprite/ui/assets";
import type { UiPartName } from "@xprite/ui/assets";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/dialogs/new-sprite-dialog/new-sprite-dialog.module.css";

const NEW_SPRITE_SIZE_PRESETS = [16, 32, 64, 128, 256, 512, 1024, 2048] as const;
const NEW_SPRITE_DIALOG_WIDTH = 360;
const NEW_SPRITE_DIALOG_MIN_WIDTH = 280;
const NEW_SPRITE_DIALOG_HEIGHT = 444;
const NEW_SPRITE_FILE_NAME_LABEL_WIDTH = 88;
const NEW_SPRITE_FILE_NAME_INPUT_GAP = 8;
const NEW_SPRITE_COLOR_MODE_WIDTH_FRACTIONS = [0.26, 0.4] as const;
const NEW_SPRITE_BACKGROUND_WIDTH_FRACTIONS = [0.45, 0.26] as const;
const NEW_SPRITE_DIMENSION_OPTIONS = NEW_SPRITE_SIZE_PRESETS.map((size) => ({
  value: String(size),
  label: tUi("ui.dimension.pixels", { size }),
}));

function clampDimension(value: number) {
  return Math.max(1, Math.min(DIALOG_IMAGE_DIMENSION_MAX, Math.round(value)));
}

export interface NewSpriteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedBaseName: string;
  width: number;
  height: number;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  /** Validation and document allocation belong to the caller's domain adapter. */
  onAccept: (
    width: number,
    height: number,
    colorDepth: 8 | 16 | 32,
    background: "transparent" | "white" | "black",
    fileBaseName: string,
  ) => void;
  disabled?: boolean;
  onHelp?: () => void;
  clientBounds?: SurfaceBounds;
}

/** Source new_sprite.xml: color mode and background are independent button sets. */
export function NewSpriteDialog({
  open,
  onOpenChange,
  suggestedBaseName,
  width,
  height,
  onWidthChange,
  onHeightChange,
  onAccept,
  disabled,
  onHelp,
  clientBounds: suppliedClientBounds,
}: NewSpriteDialogProps) {
  const initializeFocus = useEditorDialogInitialFocus();
  const inputPreferences = useDialogInputPreferences();
  const sceneBounds = useSceneBounds();
  const clientBounds = suppliedClientBounds ?? sceneBounds;
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onOpenChange);
  latest.current = onOpenChange;
  const latestSuggestedBaseName = useRef(suggestedBaseName);
  latestSuggestedBaseName.current = suggestedBaseName;
  const wasOpen = useRef(false);
  const initialDimensions = { width: String(width), height: String(height) };
  const [dimensionDrafts, setDimensionDrafts] = useState(initialDimensions);
  const dimensionDraftsRef = useRef(initialDimensions);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [fileBaseName, setFileBaseName] = useState(suggestedBaseName);
  const [choices] = useState(inputPreferences.readNewSpriteChoices);
  const [colorDepth, setColorDepth] = useState<8 | 16 | 32>(choices.colorDepth);
  const [background, setBackground] = useState<"transparent" | "white" | "black">(
    choices.background,
  );
  const widthValue = parseNewSpriteDimension(dimensionDrafts.width);
  const heightValue = parseNewSpriteDimension(dimensionDrafts.height);
  const dialogWidth = Math.min(
    NEW_SPRITE_DIALOG_WIDTH,
    Math.max(NEW_SPRITE_DIALOG_MIN_WIDTH, clientBounds.width),
  );
  const updateDimension = (axis: "width" | "height", value: string, commit = false) => {
    const parsed = parseNewSpriteDimension(value);
    const next = {
      ...dimensionDraftsRef.current,
      [axis]: parsed !== null && commit ? String(parsed) : value,
    };
    if (parsed !== null && aspectRatio !== null) {
      const paired = axis === "width" ? parsed / aspectRatio : parsed * aspectRatio;
      next[axis === "width" ? "height" : "width"] = String(clampDimension(paired));
    }
    dimensionDraftsRef.current = next;
    setDimensionDrafts(next);
  };
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      setPosition(null);
      const restoredDimensions = { width: String(width), height: String(height) };
      dimensionDraftsRef.current = restoredDimensions;
      setDimensionDrafts(restoredDimensions);
      setAspectRatio(null);
      return;
    }
    if (!wasOpen.current) {
      setFileBaseName(latestSuggestedBaseName.current);
      const initialDimensions = { width: String(width), height: String(height) };
      dimensionDraftsRef.current = initialDimensions;
      setDimensionDrafts(initialDimensions);
      setAspectRatio(null);
    }
    wasOpen.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = () => {
      initializeFocus(host.current, {
        selector: 'input[data-label-source="File name"]',
        selectText: true,
      });
    };
    first();
    const focus = (event: FocusEvent) => {
      if (
        !host.current?.contains(event.target as Node) &&
        !isDialogPopupTarget(host.current, event.target)
      )
        focusDialogContainer(host.current);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (isDialogPopupTarget(host.current, event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        latest.current(false);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(host.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        nodes.length &&
        (index < 0 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === nodes.length - 1))
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
  }, [open, width, height, initializeFocus]);
  if (!open) return null;
  const bounds = {
    x: position?.x ?? centerUiPixel(clientBounds.x, clientBounds.width, dialogWidth),
    y: position?.y ?? centerUiPixel(clientBounds.y, clientBounds.height, NEW_SPRITE_DIALOG_HEIGHT),
    width: dialogWidth,
    height: NEW_SPRITE_DIALOG_HEIGHT,
  };
  const accept = () => {
    const acceptedWidth = parseNewSpriteDimension(dimensionDraftsRef.current.width);
    const acceptedHeight = parseNewSpriteDimension(dimensionDraftsRef.current.height);
    if (disabled || acceptedWidth === null || acceptedHeight === null) return;
    const acceptedBaseName =
      host.current?.querySelector<HTMLInputElement>('input[data-label-source="File name"]')
        ?.value ?? fileBaseName;
    if (!acceptedBaseName.trim()) return;
    onWidthChange(acceptedWidth);
    onHeightChange(acceptedHeight);
    inputPreferences.writeNewSpriteChoices({ colorDepth, background });
    onAccept(acceptedWidth, acceptedHeight, colorDepth, background, acceptedBaseName.trim());
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
        if (event.altKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          onOpenChange(false);
        } else if (
          (event.altKey && event.key.toLowerCase() === "o") ||
          (event.key === "Enter" && event.target instanceof HTMLInputElement)
        ) {
          event.preventDefault();
          accept();
        }
      }}
    >
      <EditorDialog
        open
        onOpenChange={onOpenChange}
        title="New Sprite"
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
        titlebarActions={({ bounds: b }) => (
          <Button
            aria-label="New Sprite Help"
            bounds={{
              x: b.x + b.width - 44,
              y: b.y + 6,
              width: 18,
              height: 22,
            }}
            relativeTo={b}
            part="window_button_normal"
            hotPart="window_button_hot"
            pushedPart="window_button_selected"
            icon="window_help_icon"
            insetContent={false}
            disabled={!onHelp}
            onClick={onHelp}
          />
        )}
      >
        {({ clientBounds: client }) => {
          const fileNameInputX = NEW_SPRITE_FILE_NAME_LABEL_WIDTH + NEW_SPRITE_FILE_NAME_INPUT_GAP;
          const firstColorModeWidth = Math.round(
            client.width * NEW_SPRITE_COLOR_MODE_WIDTH_FRACTIONS[0],
          );
          const secondColorModeWidth = Math.round(
            client.width * NEW_SPRITE_COLOR_MODE_WIDTH_FRACTIONS[1],
          );
          const colorModeItems = [
            { x: 0, w: firstColorModeWidth },
            { x: firstColorModeWidth, w: secondColorModeWidth },
            {
              x: firstColorModeWidth + secondColorModeWidth,
              w: client.width - firstColorModeWidth - secondColorModeWidth,
            },
          ];
          const firstBackgroundWidth = Math.round(
            client.width * NEW_SPRITE_BACKGROUND_WIDTH_FRACTIONS[0],
          );
          const secondBackgroundWidth = Math.round(
            client.width * NEW_SPRITE_BACKGROUND_WIDTH_FRACTIONS[1],
          );
          const backgroundItems = [
            { x: 0, w: firstBackgroundWidth },
            { x: firstBackgroundWidth, w: secondBackgroundWidth },
            {
              x: firstBackgroundWidth + secondBackgroundWidth,
              w: client.width - firstBackgroundWidth - secondBackgroundWidth,
            },
          ];
          const dimensionStartX = 2;
          const dimensionGap = 4;
          const dimensionSeparatorWidth = 12;
          const lockButtonWidth = 28;
          const dimensionInputWidth = Math.floor(
            (client.width -
              dimensionStartX -
              dimensionSeparatorWidth -
              lockButtonWidth -
              dimensionGap * 3 -
              dimensionStartX) /
              2,
          );
          const widthInputX = dimensionStartX;
          const dimensionSeparatorX = widthInputX + dimensionInputWidth + dimensionGap;
          const heightInputX = dimensionSeparatorX + dimensionSeparatorWidth + dimensionGap;
          const lockButtonX = heightInputX + dimensionInputWidth + dimensionGap;
          const section = (text: string, y: number) => {
            return (
              <Divider
                key={text}
                text={text}
                bounds={{
                  x: client.x,
                  y: client.y + y,
                  width: client.width,
                  height: 22,
                }}
                relativeTo={client}
              />
            );
          };
          return (
            <>
              <Text
                variant={TextVariant.Control}
                text="File name:"
                bounds={{
                  x: client.x + 2,
                  y: client.y + 8,
                  width: NEW_SPRITE_FILE_NAME_LABEL_WIDTH,
                  height: 14,
                }}
                relativeTo={client}
              />
              <Input
                aria-label="File name"
                aria-invalid={!fileBaseName.trim() || undefined}
                value={fileBaseName}
                onValueChange={setFileBaseName}
                bounds={{
                  x: client.x + fileNameInputX,
                  y: client.y,
                  width: client.width - fileNameInputX,
                  height: 30,
                }}
                relativeTo={client}
              />
              {section("Size:", 42)}
              <Text
                variant={TextVariant.Control}
                text="Width:"
                bounds={{
                  x: client.x + widthInputX,
                  y: client.y + 72,
                  width: dimensionInputWidth,
                  height: 14,
                }}
                relativeTo={client}
              />
              <Combobox
                aria-label="Width"
                aria-invalid={widthValue === null || undefined}
                bounds={{
                  x: client.x + widthInputX,
                  y: client.y + 90,
                  width: dimensionInputWidth,
                  height: 30,
                }}
                relativeTo={client}
                editable
                inputMode="numeric"
                suffix="px"
                value={dimensionDrafts.width}
                options={NEW_SPRITE_DIMENSION_OPTIONS}
                onDraftValueChange={(value) => updateDimension("width", value)}
                onValueChange={(value) => updateDimension("width", value, true)}
              />
              <Text
                variant={TextVariant.Control}
                text="×"
                bounds={{
                  x: client.x + dimensionSeparatorX,
                  y: client.y + 98,
                  width: dimensionSeparatorWidth,
                  height: 14,
                }}
                align="center"
                relativeTo={client}
              />
              <Text
                variant={TextVariant.Control}
                text="Height:"
                bounds={{
                  x: client.x + heightInputX,
                  y: client.y + 72,
                  width: dimensionInputWidth,
                  height: 14,
                }}
                relativeTo={client}
              />
              <Combobox
                aria-label="Height"
                aria-invalid={heightValue === null || undefined}
                bounds={{
                  x: client.x + heightInputX,
                  y: client.y + 90,
                  width: dimensionInputWidth,
                  height: 30,
                }}
                relativeTo={client}
                editable
                inputMode="numeric"
                suffix="px"
                value={dimensionDrafts.height}
                options={NEW_SPRITE_DIMENSION_OPTIONS}
                onDraftValueChange={(value) => updateDimension("height", value)}
                onValueChange={(value) => updateDimension("height", value, true)}
              />
              <Button
                variant={ButtonVariant.Icon}
                className={styles.lockRatio}
                paintArtwork={false}
                aria-label="Lock Ratio"
                aria-pressed={aspectRatio !== null}
                title="Lock Ratio"
                bounds={{
                  x: client.x + lockButtonX,
                  y: client.y + 90,
                  width: lockButtonWidth,
                  height: 30,
                }}
                relativeTo={client}
                onClick={() => {
                  if (aspectRatio !== null) {
                    setAspectRatio(null);
                    return;
                  }
                  const currentWidth =
                    parseNewSpriteDimension(dimensionDraftsRef.current.width) ?? width;
                  const currentHeight =
                    parseNewSpriteDimension(dimensionDraftsRef.current.height) ?? height;
                  setAspectRatio(currentWidth / currentHeight);
                }}
              >
                <UiIcon
                  part={
                    aspectRatio === null
                      ? "timeline_open_padlock_normal"
                      : "timeline_closed_padlock_normal"
                  }
                  scale={2}
                  color="var(--xse-lock-ratio-icon-color, currentColor)"
                  style={{ position: "relative" }}
                />
              </Button>
              {section("Color Mode:", 128)}
              {section(`${tUi("ui.background")}:`, 230)}
              {[
                {
                  label: "RGBA",
                  icon: "icon_rgb",
                  y: 158,
                  ...colorModeItems[0],
                  selected: colorDepth === 32,
                  onClick: () => setColorDepth(32),
                },
                {
                  label: "Grayscale",
                  icon: "icon_grayscale",
                  y: 158,
                  ...colorModeItems[1],
                  selected: colorDepth === 16,
                  onClick: () => setColorDepth(16),
                },
                {
                  label: "Indexed",
                  icon: "icon_indexed",
                  y: 158,
                  ...colorModeItems[2],
                  selected: colorDepth === 8,
                  onClick: () => setColorDepth(8),
                },
                {
                  label: "Transparent",
                  icon: "icon_transparent",
                  y: 260,
                  ...backgroundItems[0],
                  selected: background === "transparent",
                  onClick: () => setBackground("transparent"),
                },
                {
                  label: "White",
                  icon: "icon_white",
                  y: 260,
                  ...backgroundItems[1],
                  selected: background === "white",
                  onClick: () => setBackground("white"),
                },
                {
                  label: "Black",
                  icon: "icon_black",
                  y: 260,
                  ...backgroundItems[2],
                  selected: background === "black",
                  onClick: () => setBackground("black"),
                },
              ].map((item) => (
                <NewSpriteOption
                  key={item.label}
                  label={item.label}
                  selected={item.selected}
                  onClick={item.onClick}
                  icon={item.icon as UiPartName}
                  bounds={{
                    x: client.x + item.x,
                    y: client.y + item.y,
                    // ButtonSet::Item compensates the -1 GUI column gap when painting.
                    width: item.w + (item.x + item.w < client.width ? 2 : 0),
                    height: 64,
                  }}
                  relativeTo={client}
                />
              ))}
              <Checkbox
                label="Advanced Options"
                checked={false}
                disabled
                onCheckedChange={() => {}}
                bounds={{
                  x: client.x,
                  y: client.y + 332,
                  width: client.width,
                  height: 24,
                }}
                relativeTo={client}
              />
              <Button
                text="OK"
                mnemonicIndex={0}
                font="default"
                part="button_normal"
                hotPart="button_hot"
                focusedPart="button_focused"
                pushedPart="button_selected"
                disabled={
                  disabled || widthValue === null || heightValue === null || !fileBaseName.trim()
                }
                bounds={{
                  x: client.x + client.width - 248,
                  y: client.y + 364,
                  width: 120,
                  height: 34,
                }}
                relativeTo={client}
                onClick={accept}
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
                  y: client.y + 364,
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
    </div>
  );
}

/** theme.xml buttonset_item_text_top_icon_bottom selection styling. */
function NewSpriteOption({
  label,
  selected,
  onClick,
  icon,
  bounds,
  relativeTo,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon: UiPartName;
  bounds: SurfaceBounds;
  relativeTo: SurfaceBounds;
}) {
  const assets = useUiAssets();
  return (
    <Button
      aria-label={label}
      aria-pressed={selected}
      selected={selected}
      text={label}
      icon={icon}
      font="mini"
      color={assets?.style.colors.button_hot_text}
      part="buttonset_item_normal"
      hotPart="buttonset_item_hot"
      textOffset={{ x: 0, y: -16 }}
      iconOffset={{ x: 0, y: 6 }}
      bounds={bounds}
      relativeTo={relativeTo}
      onClick={onClick}
    />
  );
}
