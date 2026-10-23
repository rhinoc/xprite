import type { Ink } from "$/managers/preferences/tool-ink-settings";
import { ToolInk as InkMode } from "$/managers/tools/tool-options";
import { Button, Menu, MenuCheckType, Tooltip, TooltipPlacement } from "@xprite/ui";
import type { SurfaceBounds, SurfaceViewport } from "@xprite/ui";
import type { UiPartName } from "@xprite/ui/assets";

const inkOptions: readonly { value: Ink; label: string; icon: UiPartName }[] = [
  { value: InkMode.Simple, label: "Simple Ink", icon: "ink_simple" },
  {
    value: InkMode.AlphaCompositing,
    label: "Alpha Compositing",
    icon: "ink_alpha_compositing",
  },
  { value: InkMode.CopyColor, label: "Copy Alpha + Color", icon: "ink_copy_color" },
  { value: InkMode.LockAlpha, label: "Lock Alpha", icon: "ink_lock_alpha" },
  { value: InkMode.Shading, label: "Shading", icon: "ink_shading" },
];

export interface InkPickerProps {
  value: Ink;
  onValueChange: (value: Ink) => void;
  shared: boolean;
  onSharedChange: (value: boolean) => void;
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
}
/** Exact English ink popup order and source toolbar icon variants. */
export function InkPicker({
  value,
  onValueChange,
  shared,
  onSharedChange,
  bounds,
  relativeTo,
  viewport,
}: InkPickerProps) {
  const selected = inkOptions.find((option) => option.value === value) ?? inkOptions[0];
  return (
    <Menu
      label="Ink"
      items={[
        ...inkOptions.map((option) => ({
          label: option.label,
          checked: value === option.value,
          onSelect: () => onValueChange(option.value),
        })),
        {
          label: "Same in all Tools",
          checked: shared,
          checkType: MenuCheckType.Checkbox,
          separator: true,
          onSelect: () => onSharedChange(!shared),
        },
      ]}
      renderTrigger={(props) => (
        <Tooltip text="Ink" placement={TooltipPlacement.Bottom} disabled={!!props["aria-expanded"]}>
          <Button
            {...props}
            bounds={bounds}
            relativeTo={relativeTo}
            viewport={viewport}
            icon={selected.icon}
            iconOffset={{ x: 2, y: 0 }}
          />
        </Tooltip>
      )}
    />
  );
}
