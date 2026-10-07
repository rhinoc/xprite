import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { SelectionModeControl } from "$/components/tools/selection-mode-control";
import { useSelectionToolbarModel } from "$/managers/tools/selection-toolbar-model";
import {
  ToolSelectionPivotPosition,
  ToolSelectionRotationAlgorithm,
  type ToolSelectionMode,
} from "$/managers/tools/tool-options";
import {
  Button,
  Combobox,
  ControlFlowItem,
  Input,
  Menu,
  MenuCheckType,
  type MenuItem,
  type SurfaceBounds,
  useUi,
  Text,
  TextVariant,
} from "@xprite/ui";
import type { UiPartName } from "@xprite/ui/assets";
import { measurePopoverAnchor } from "@xprite/ui/popover";

const CONTROL_BOUNDS = {
  mode: { x: 164, y: 0, width: 114, height: 32 },
  colorOptions: { x: 286, y: 0, width: 44, height: 32 },
  color: { x: 338, y: 0, width: 128, height: 32 },
  pivot: { x: 474, y: 0, width: 30, height: 32 },
  rotation: { x: 512, y: 0, width: 162, height: 32 },
  cornerRadiusLabel: { x: 682, y: 10, width: 10, height: 14 },
  cornerRadius: { x: 694, y: 0, width: 36, height: 32 },
} as const;
const PIVOT_ICONS: Record<ToolSelectionPivotPosition, UiPartName> = {
  [ToolSelectionPivotPosition.Northwest]: "pivot_northwest",
  [ToolSelectionPivotPosition.North]: "pivot_north",
  [ToolSelectionPivotPosition.Northeast]: "pivot_northeast",
  [ToolSelectionPivotPosition.West]: "pivot_west",
  [ToolSelectionPivotPosition.Center]: "pivot_center",
  [ToolSelectionPivotPosition.East]: "pivot_east",
  [ToolSelectionPivotPosition.Southwest]: "pivot_southwest",
  [ToolSelectionPivotPosition.South]: "pivot_south",
  [ToolSelectionPivotPosition.Southeast]: "pivot_southeast",
};
const PIVOT_CHOICES: readonly { value: ToolSelectionPivotPosition; label: string }[] = [
  { value: ToolSelectionPivotPosition.Northwest, label: "Northwest" },
  { value: ToolSelectionPivotPosition.North, label: "North" },
  { value: ToolSelectionPivotPosition.Northeast, label: "Northeast" },
  { value: ToolSelectionPivotPosition.West, label: "West" },
  { value: ToolSelectionPivotPosition.Center, label: "Center" },
  { value: ToolSelectionPivotPosition.East, label: "East" },
  { value: ToolSelectionPivotPosition.Southwest, label: "Southwest" },
  { value: ToolSelectionPivotPosition.South, label: "South" },
  { value: ToolSelectionPivotPosition.Southeast, label: "Southeast" },
];
const ROTATION_ALGORITHMS = [
  { value: ToolSelectionRotationAlgorithm.Fast, label: "Fast Rotation" },
  { value: ToolSelectionRotationAlgorithm.RotSprite, label: "RotSprite" },
] as const;
const MIN_CORNER_RADIUS = 0;

export interface SelectionOptionsProps {
  mode: ToolSelectionMode;
  onModeChange: (mode: ToolSelectionMode) => void;
  marquee: boolean;
  onCommitted?: (element: HTMLElement) => void;
}

/** Toolbar settings for selection-mask creation and pixel transforms. */
export function SelectionOptions({
  mode,
  onModeChange,
  marquee,
  onCommitted,
}: SelectionOptionsProps) {
  const model = useSelectionToolbarModel();
  const { translateSource } = useUi();
  const colorButton = useRef<HTMLButtonElement>(null);
  const cornerRadiusInput = useRef<HTMLInputElement | null>(null);
  const [colorAnchor, setColorAnchor] = useState<SurfaceBounds>(CONTROL_BOUNDS.color);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const transformOptionsEnabled =
    model.enabled && model.pixelTransformsEnabled && !model.transformActive;
  useEffect(() => {
    if (!transformOptionsEnabled) setColorPickerOpen(false);
  }, [transformOptionsEnabled]);
  const colorOptions: MenuItem[] = [
    {
      label: "Opaque",
      disabled: !transformOptionsEnabled,
      checked: !model.autoOpaque && model.opaque,
      checkType: MenuCheckType.Radio,
      onSelect: () => model.setOpaque(true),
    },
    {
      label: "Transparent",
      disabled: !transformOptionsEnabled,
      checked: !model.autoOpaque && !model.opaque,
      checkType: MenuCheckType.Radio,
      onSelect: () => model.setOpaque(false),
    },
    {
      label: "Auto adjust layer",
      disabled: !transformOptionsEnabled,
      separator: true,
      checked: model.autoOpaque,
      checkType: MenuCheckType.Checkbox,
      onSelect: () => model.setAutoOpaque(!model.autoOpaque),
    },
  ];
  const pivotOptions: MenuItem[] = [
    {
      label: "Show pivot",
      disabled: !transformOptionsEnabled,
      checked: model.pivotVisible,
      checkType: MenuCheckType.Checkbox,
      onSelect: () => model.setPivotVisible(!model.pivotVisible),
    },
    ...PIVOT_CHOICES.map((choice) => ({
      label: choice.label,
      disabled: !transformOptionsEnabled,
      checked: model.pivotPosition === choice.value,
      checkType: MenuCheckType.Radio,
      separator: choice.value === ToolSelectionPivotPosition.Northwest,
      onSelect: () => model.setPivotPosition(choice.value),
    })),
  ];

  return (
    <>
      <ControlFlowItem bounds={CONTROL_BOUNDS.mode}>
        <SelectionModeControl mode={mode} onChange={onModeChange} x={164} y={0} />
      </ControlFlowItem>
      <ControlFlowItem bounds={CONTROL_BOUNDS.colorOptions}>
        <Menu
          label="Transparent color options"
          items={colorOptions}
          renderTrigger={(props) => (
            <Button
              {...props}
              bounds={CONTROL_BOUNDS.colorOptions}
              icon={model.effectiveOpaque ? "selection_opaque" : "selection_masked"}
              aria-label={translateSource("Transparent color options")}
              disabled={!transformOptionsEnabled}
            />
          )}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <EditorColorButton
          bounds={CONTROL_BOUNDS.color}
          buttonRef={colorButton}
          value={model.transparentColor}
          mask
          disabled={!transformOptionsEnabled || model.effectiveOpaque}
          aria-label={translateSource("Selection transparent color")}
          onClick={() => {
            if (colorButton.current)
              setColorAnchor(measurePopoverAnchor(colorButton.current).bounds);
            setColorPickerOpen(true);
          }}
        />
      </ControlFlowItem>
      <ControlFlowItem bounds={CONTROL_BOUNDS.pivot}>
        <Menu
          label="Selection pivot"
          items={pivotOptions}
          renderTrigger={(props) => (
            <Button
              {...props}
              bounds={CONTROL_BOUNDS.pivot}
              icon={PIVOT_ICONS[model.pivotPosition]}
              aria-label={translateSource("Selection pivot")}
              disabled={!transformOptionsEnabled}
            />
          )}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <Combobox
          bounds={CONTROL_BOUNDS.rotation}
          value={model.rotationAlgorithm}
          options={ROTATION_ALGORITHMS}
          onValueChange={(value) =>
            model.setRotationAlgorithm(value as ToolSelectionRotationAlgorithm)
          }
          disabled={!transformOptionsEnabled}
          aria-label={translateSource("Rotation algorithm")}
        />
      </ControlFlowItem>
      {marquee && (
        <>
          <ControlFlowItem>
            <Text
              variant={TextVariant.Control}
              bounds={CONTROL_BOUNDS.cornerRadiusLabel}
              text="R:"
              font="mini"
            />
          </ControlFlowItem>
          <ControlFlowItem>
            <Input
              bounds={CONTROL_BOUNDS.cornerRadius}
              mini
              value={String(model.cornerRadius)}
              inputMode="numeric"
              aria-label={translateSource("Corner radius")}
              disabled={!model.enabled}
              onFocus={(event) => {
                cornerRadiusInput.current = event.currentTarget;
              }}
              onCommit={(text) => {
                const value = Number(text);
                if (text.trim() && Number.isFinite(value))
                  model.setCornerRadius(Math.max(MIN_CORNER_RADIUS, Math.round(value)));
                if (cornerRadiusInput.current) onCommitted?.(cornerRadiusInput.current);
              }}
            />
          </ControlFlowItem>
        </>
      )}
      {colorPickerOpen &&
        createPortal(
          <ColorPicker
            open
            onOpenChange={(open) => setColorPickerOpen(open)}
            title={translateSource("Selection transparent color")}
            anchor={colorAnchor}
            value={model.transparentColor}
            onValueChange={model.setTransparentColor}
          />,
          document.body,
        )}
    </>
  );
}
