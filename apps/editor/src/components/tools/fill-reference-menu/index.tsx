import {
  ToolFillReference as FillReference,
  type ToolFillReference,
} from "$/managers/tools/tool-options";
import { Button, Menu, MenuCheckType, Tooltip } from "@xprite/ui";
import type { SurfaceBounds, SurfaceViewport } from "@xprite/ui";

export interface FillReferenceMenuProps {
  bounds: SurfaceBounds;
  reference: ToolFillReference;
  onReferenceChange: (reference: ToolFillReference) => void;
  iconOffset?: { x: number; y: number };
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
}

/** Chooses which rendered pixels define bucket and gradient fill boundaries. */
export function FillReferenceMenu({
  bounds,
  reference,
  onReferenceChange,
  iconOffset = { x: 2, y: 0 },
  relativeTo,
  viewport,
}: FillReferenceMenuProps) {
  return (
    <Menu
      label="Paint bucket settings"
      items={[
        {
          label: "Refer only active layer",
          checkType: MenuCheckType.Radio,
          checked: reference === FillReference.ActiveLayer,
          onSelect: () => onReferenceChange(FillReference.ActiveLayer),
        },
        {
          label: "Refer visible layers",
          checkType: MenuCheckType.Radio,
          checked: reference === FillReference.VisibleLayers,
          onSelect: () => onReferenceChange(FillReference.VisibleLayers),
        },
      ]}
      renderTrigger={(props) => (
        <Tooltip
          text="Paint bucket settings"
          placement="bottom"
          disabled={!!props["aria-expanded"]}
        >
          <Button
            {...props}
            bounds={bounds}
            relativeTo={relativeTo}
            viewport={viewport}
            icon="timeline_gear"
            iconOffset={iconOffset}
            aria-label="Paint bucket settings"
          />
        </Tooltip>
      )}
    />
  );
}
