import * as React from "react";
import { createPortal } from "react-dom";

import { tUi, tUiSource } from "$/i18n";
import { useUserPresets } from "$/managers/preferences/use-user-presets";
import {
  captureUserShade,
  copyUserBrushSlot,
  type UserBrushSlot,
  type UserBrushFlags,
  type UserBrushSettings,
} from "$/managers/preferences/user-presets";
import {
  getBrushPickerMask as asepriteBrushMask,
  BrushImagePatternChoice as BrushImagePattern,
  type BrushPickerValue as AsepriteBrushValue,
  type BrushPickerShape as AsepriteBrushShape,
  type BrushPickerImage as BrushImage,
  type ToolColor as Rgba,
} from "$/managers/tools/tool-options";
import {
  Button,
  Divider,
  type ButtonProps,
  Menu,
  MenuCheckType,
  type MenuItem,
  Tooltip,
  type SurfaceBounds,
  type SurfaceViewport,
  useUi,
} from "@xprite/ui";
import { centerUiPixel, measureUiText, UiPart } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import { anchoredPopoverStyle, useAnchoredPopover } from "@xprite/ui/popover";
import { stylusPointerInputProps } from "@xprite/ui/utils";

export interface BrushPickerProps {
  value: AsepriteBrushValue;
  onValueChange: (value: AsepriteBrushValue) => void;
  pixelPerfect?: boolean;
  onPixelPerfectChange?: (value: boolean) => void;
  onCreateFromSelection?: () => BrushImage | null;
  canCreateFromSelection?: boolean;
  foreground?: Rgba;
  background?: Rgba;
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  settings?: UserBrushSettings;
  onSettingsChange?: (settings: UserBrushSettings) => void;
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  disabled?: boolean;
  "aria-label"?: string;
}
const SHAPES: readonly AsepriteBrushShape[] = ["circle", "square", "line"];
const names = { circle: "Circle", square: "Square", line: "Line", image: "Image" };

/** The bitmap belongs to the brush, not the UI atlas. Both use the same sampling grid. */
function BrushButton({
  brush,
  ...props
}: ButtonProps & { bounds: SurfaceBounds; brush: AsepriteBrushValue }) {
  const { style: uiStyle } = useUi();
  const [pressed, setPressed] = React.useState(false);
  const viewport = props.viewport ?? DEFAULT_SURFACE_VIEWPORT;
  const b = props.bounds,
    relative = props.relativeTo ?? { x: 0, y: 0 };
  const layout = surfaceLayout(b, viewport);
  const mask = asepriteBrushMask(brush);
  let path = "";
  for (let row = 0; row < mask.height; row++)
    for (let col = 0; col < mask.width; col++)
      if (mask.pixels[row * mask.width + col]) path += `M${col * 2} ${row * 2}h2v2h-2z`;
  const x = centerUiPixel(b.x + 6, b.width - 12, mask.width * 2) - b.x;
  const y = centerUiPixel(b.y + 6, b.height - 16, mask.height * 2) - b.y;
  return (
    <>
      <Button
        {...props}
        onPointerDown={(e) => {
          if (e.button === 0) setPressed(true);
          props.onPointerDown?.(e);
        }}
        onPointerUp={(e) => {
          setPressed(false);
          props.onPointerUp?.(e);
        }}
        onPointerLeave={(e) => {
          setPressed(false);
          props.onPointerLeave?.(e);
        }}
        onPointerCancel={(e) => {
          setPressed(false);
          props.onPointerCancel?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") setPressed(true);
          props.onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          setPressed(false);
          props.onKeyUp?.(e);
        }}
        onBlur={(e) => {
          setPressed(false);
          props.onBlur?.(e);
        }}
      />
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${b.width} ${b.height}`}
        width={layout.width}
        height={layout.height}
        style={{
          position: "absolute",
          zIndex: 5,
          pointerEvents: "none",
          left: layout.left - Math.floor((relative.x * viewport.width) / viewport.sceneWidth),
          top: layout.top - Math.floor((relative.y * viewport.height) / viewport.sceneHeight),
          shapeRendering: "crispEdges",
        }}
      >
        <path
          d={path}
          transform={`translate(${x} ${y})`}
          fill={pressed ? uiStyle.colors.button_selected_text : uiStyle.colors.button_normal_text}
        />
      </svg>
    </>
  );
}

/** BrushPopup's three standard brushes and local saved slots. Shape selection preserves size/angle. */
export function BrushPicker({
  value,
  onValueChange,
  pixelPerfect = false,
  onPixelPerfectChange,
  onCreateFromSelection,
  canCreateFromSelection = true,
  foreground,
  background,
  foregroundIndex,
  backgroundIndex,
  settings = {},
  onSettingsChange,
  bounds,
  relativeTo,
  viewport = DEFAULT_SURFACE_VIEWPORT,
  disabled,
  "aria-label": label = "Brush type",
}: BrushPickerProps) {
  const { style: uiStyle } = useUi();
  const {
    triggerRef: trigger,
    panelRef: panel,
    popover: popup,
    open: openPopover,
    close,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(viewport);
  const presets = useUserPresets();
  const slots = presets.brushes;
  const flags = presets.flags;
  const setSlots = (update: (items: UserBrushSlot[]) => UserBrushSlot[]) =>
    presets.manager.setBrushes(update);
  const setFlags = (next: UserBrushFlags) => presets.manager.setFlags(next);
  const captureSlot = (locked: boolean, id = presets.manager.nextBrushId()): UserBrushSlot => ({
    id,
    value: { ...value },
    flags: { ...flags },
    locked,
    pixelPerfect,
    foreground,
    background,
    ink: settings.ink,
    opacity: settings.opacity,
    shade: captureUserShade(settings.shade ?? []),
  });
  disabled = disabled || !presets.ready;
  const id = React.useId();
  const width = Math.max(106, measureUiText("Save Brush Here", "mini") + 16 + 26 - 2 + 8);
  const height = 8 + 38 + 8 + (slots.length + 1) * 30;
  const open = () => openPopover({ width, height, offsetY: -4 });
  React.useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  const pb = popup ? { x: popup.x, y: popup.y, width, height } : null;
  const flagLabels: Record<keyof UserBrushFlags, string> = {
    shape: "Brush Type",
    size: "Brush Size",
    angle: "Brush Angle",
    imageColor: "Image Colors",
    foreground: "Foreground Color",
    background: "Background Color",
    ink: tUi("ui.ink.type"),
    opacity: tUi("ui.ink.opacity.label"),
    shade: "Shade",
    pixelPerfect: "Pixel-perfect",
  };
  const flagItems = (current: UserBrushFlags, update: (next: UserBrushFlags) => void): MenuItem[] =>
    (Object.keys(flagLabels) as (keyof UserBrushFlags)[]).map((key) => ({
      label: flagLabels[key],
      checked: current[key],
      checkType: MenuCheckType.Checkbox,
      onSelect: () => update({ ...current, [key]: !current[key] }),
    }));
  const applySlot = (savedSlot: UserBrushSlot) => {
    const slot = copyUserBrushSlot(savedSlot);
    const workingForeground = slot.flags.foreground ? slot.foreground : foreground;
    const workingBackground = slot.flags.background ? slot.background : background;
    onSettingsChange?.({
      ...(slot.flags.foreground && slot.foreground ? { foreground: slot.foreground } : {}),
      ...(slot.flags.background && slot.background ? { background: slot.background } : {}),
      ...(slot.flags.ink && slot.ink ? { ink: slot.ink } : {}),
      ...(slot.flags.opacity && slot.opacity !== undefined ? { opacity: slot.opacity } : {}),
      ...(slot.flags.shade ? { shade: presets.restoreShade(slot.shade) } : {}),
    });
    const shape = slot.flags.shape ? slot.value.shape : value.shape;
    let image = shape === "image" ? (slot.flags.shape ? slot.value.image : value.image) : undefined;
    if (image && !slot.flags.imageColor) {
      image = {
        ...image,
        imageColors: {
          ...image.imageColors,
          ...(workingForeground ? { main: [...workingForeground] as Rgba } : {}),
          ...(workingBackground ? { background: [...workingBackground] as Rgba } : {}),
          mainIndex: slot.flags.foreground ? undefined : (foregroundIndex ?? undefined),
          backgroundIndex: slot.flags.background ? undefined : (backgroundIndex ?? undefined),
        },
      };
    }
    onValueChange({
      shape,
      size: slot.flags.size ? slot.value.size : value.size,
      angle: slot.flags.angle ? slot.value.angle : value.angle,
      ...(image ? { image } : {}),
    });
    if (slot.flags.pixelPerfect) onPixelPerfectChange?.(slot.pixelPerfect);
  };
  const createFromSelection = () => {
    const image = onCreateFromSelection?.();
    if (!image) return;
    const nextValue: AsepriteBrushValue = { ...value, shape: "image", image };
    onValueChange(nextValue);
    // Aseprite brush slots retain created image brushes for later selection.
    setSlots((items) => [
      ...items,
      {
        ...captureSlot(false),
        value: nextValue,
        flags: { ...flags, shape: true },
      },
    ]);
    close();
  };
  const setImagePattern = (pattern: BrushImagePattern) => {
    if (value.shape !== "image" || !value.image) return;
    onValueChange({ ...value, image: { ...value.image, pattern } });
  };
  return (
    <>
      <Tooltip text="Brush Type" placement="bottom" disabled={!!popup || disabled}>
        <BrushButton
          bounds={bounds}
          relativeTo={relativeTo}
          viewport={viewport}
          brush={value}
          buttonRef={trigger}
          disabled={disabled}
          selected={!!popup}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={!!popup}
          {...stylusPointerInputProps(!disabled)}
          aria-controls={popup ? id : undefined}
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.preventDefault();
              if (popup) close();
              else open();
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) {
              if (popup) close();
              else open();
            }
          }}
        />
      </Tooltip>
      {popup &&
        pb &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={tUi("ui.brushes")}
            style={{
              ...anchoredPopoverStyle(popup, pb),
              backgroundColor: uiStyle.colors.menuitem_normal_face,
            }}
          >
            <UiPart
              part="menu"
              scale={2}
              drawCenter
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
            <Divider
              bounds={{ x: pb.x + 4, y: pb.y + 42, width: pb.width - 8, height: 8 }}
              relativeTo={pb}
              viewport={popup.viewport}
            />
            {SHAPES.map((shape, index) => (
              <BrushButton
                key={shape}
                bounds={{ x: pb.x + 4 + index * 32, y: pb.y + 4, width: 34, height: 38 }}
                relativeTo={pb}
                viewport={popup.viewport}
                brush={{ shape, size: 7, angle: shape === "line" ? 44 : 0 }}
                aria-label={tUi("ui.brush.2", { value1: tUiSource(names[shape]) })}
                selected={value.shape === shape}
                onClick={() => onValueChange({ ...value, shape, image: undefined })}
              />
            ))}
            {slots.map((slot, index) => {
              const y = pb.y + 50 + index * 30;
              const update = (next: Partial<UserBrushSlot>) =>
                setSlots((items) =>
                  items.map((item) => (item.id === slot.id ? { ...item, ...next } : item)),
                );
              return (
                <React.Fragment key={slot.id}>
                  <BrushButton
                    bounds={{ x: pb.x + 4, y, width: 34, height: 30 }}
                    relativeTo={pb}
                    viewport={popup.viewport}
                    brush={slot.value}
                    aria-label={tUi("ui.saved.brush", { value1: index + 1 })}
                    onClick={() => applySlot(slot)}
                  />
                  <Button
                    bounds={{ x: pb.x + 38, y, width: width - 70, height: 30 }}
                    relativeTo={pb}
                    viewport={popup.viewport}
                    disabled
                    aria-label={tUi("ui.shortcut.for.saved.brush.not.configured", {
                      value1: index + 1,
                    })}
                  />
                  <Menu
                    label={tUi("ui.saved.brush.options", { value1: index + 1 })}
                    items={[
                      {
                        label: "Save Brush Here",
                        onSelect: () =>
                          update({
                            ...captureSlot(true, slot.id),
                          }),
                      },
                      {
                        label: "Locked",
                        checkType: MenuCheckType.Checkbox,
                        checked: slot.locked,
                        separator: true,
                        onSelect: () => update({ locked: !slot.locked }),
                      },
                      {
                        label: "Delete",
                        onSelect: () =>
                          setSlots((items) => items.filter((item) => item.id !== slot.id)),
                      },
                      { label: "Delete All", separator: true, onSelect: () => setSlots(() => []) },
                      ...flagItems(slot.flags, (next) => update({ flags: next })).map(
                        (item, i) => ({ ...item, separator: i === 0 }),
                      ),
                    ]}
                    renderTrigger={(props) => (
                      <Button
                        {...props}
                        bounds={{ x: pb.x + width - 30, y, width: 26, height: 30 }}
                        relativeTo={pb}
                        viewport={popup.viewport}
                        icon="icon_arrow_down"
                      />
                    )}
                  />
                </React.Fragment>
              );
            })}
            <Button
              bounds={{
                x: pb.x + 4,
                y: pb.y + 50 + slots.length * 30,
                width: width - 32,
                height: 30,
              }}
              relativeTo={pb}
              viewport={popup.viewport}
              text="Save Brush Here"
              onClick={() =>
                setSlots((items) => [
                  ...items,
                  {
                    ...captureSlot(true),
                  },
                ])
              }
            />
            <Menu
              label="Brush options"
              items={[
                {
                  label: "Brush from Selection",
                  disabled: !onCreateFromSelection || !canCreateFromSelection,
                  onSelect: createFromSelection,
                },
                {
                  label: "Aligned to Source",
                  checkType: MenuCheckType.Radio,
                  checked:
                    value.image?.pattern !== BrushImagePattern.AlignedToDestination &&
                    value.image?.pattern !== BrushImagePattern.PaintBrush,
                  disabled: value.shape !== "image",
                  onSelect: () => setImagePattern(BrushImagePattern.AlignedToSource),
                },
                {
                  label: "Aligned to Destination",
                  checkType: MenuCheckType.Radio,
                  checked: value.image?.pattern === BrushImagePattern.AlignedToDestination,
                  disabled: value.shape !== "image",
                  onSelect: () => setImagePattern(BrushImagePattern.AlignedToDestination),
                },
                {
                  label: "Paint Brush",
                  checkType: MenuCheckType.Radio,
                  checked: value.image?.pattern === BrushImagePattern.PaintBrush,
                  disabled: value.shape !== "image",
                  onSelect: () => setImagePattern(BrushImagePattern.PaintBrush),
                },
                ...flagItems(flags, setFlags).map((item, index) => ({
                  ...item,
                  separator: index === 0,
                })),
              ]}
              renderTrigger={(props) => (
                <Button
                  {...props}
                  bounds={{
                    x: pb.x + width - 30,
                    y: pb.y + 50 + slots.length * 30,
                    width: 26,
                    height: 30,
                  }}
                  relativeTo={pb}
                  viewport={popup.viewport}
                  icon="icon_arrow_down"
                />
              )}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
