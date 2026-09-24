import type { Ink } from "$/managers/preferences/tool-ink-settings";
import { ToolInk as AsepriteInk } from "$/managers/tools/tool-options";
import { Button } from "@xprite/ui";
import { Menu, MenuCheckType } from "@xprite/ui";
import { Tooltip } from "@xprite/ui";
import type { SurfaceBounds, SurfaceViewport } from "@xprite/ui";
import type { UiPartName } from "@xprite/ui/assets";

const asepriteInkOptions: readonly { value: Ink; label: string; icon: UiPartName }[] = [
  { value: AsepriteInk.Simple, label: "Simple Ink", icon: "ink_simple" },
  {
    value: AsepriteInk.AlphaCompositing,
    label: "Alpha Compositing",
    icon: "ink_alpha_compositing",
  },
  { value: AsepriteInk.CopyColor, label: "Copy Alpha + Color", icon: "ink_copy_color" },
  { value: AsepriteInk.LockAlpha, label: "Lock Alpha", icon: "ink_lock_alpha" },
  { value: AsepriteInk.Shading, label: "Shading", icon: "ink_shading" },
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
  const selected =
    asepriteInkOptions.find((option) => option.value === value) ?? asepriteInkOptions[0];
  return (
    <Menu
      label="Ink"
      items={[
        ...asepriteInkOptions.map((option) => ({
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
        <Tooltip text="Ink" placement="bottom" disabled={!!props["aria-expanded"]}>
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
