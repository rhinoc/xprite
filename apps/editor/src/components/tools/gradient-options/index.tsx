import { FillReferenceMenu } from "$/components/tools/fill-reference-menu";
import { useReleaseEditorInputFocus } from "$/managers/tools/input-commands";
import {
  type ToolFillReference,
  ToolGradientDither as GradientDither,
  ToolGradientType as GradientType,
  TOOL_CONTROL_CHANNEL_MAX as UINT8_MAX,
} from "$/managers/tools/tool-options";
import { ControlFlowItem } from "@xprite/ui";
import { Button, Input, InputTouchActivation, Label } from "@xprite/ui";
import { Combobox } from "@xprite/ui";
import { Checkbox } from "@xprite/ui";
import { Slider, SliderVariant } from "@xprite/ui";
import { Tooltip } from "@xprite/ui";
import type { SurfaceBounds, SurfaceViewport } from "@xprite/ui";

interface GradientOptionsProps {
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  type: GradientType;
  dither: GradientDither;
  onTypeChange: (value: GradientType) => void;
  onDitherChange: (value: GradientDither) => void;
}
/** Product gradient type and dithering controls. Theme layout uses 14/15px
 * buttons, 4px spacing, and a 138px combobox. */
function GradientOptions({
  bounds,
  relativeTo,
  viewport,
  type,
  dither,
  onTypeChange,
  onDitherChange,
}: GradientOptionsProps) {
  const common = { relativeTo, viewport };
  return (
    <>
      {([GradientType.Linear, GradientType.Radial] as const).map((value, index) => (
        <ControlFlowItem>
          <Tooltip
            key={value}
            text={value === GradientType.Linear ? "Linear Gradient" : "Radial Gradient"}
            placement="bottom"
          >
            <Button
              {...common}
              bounds={{
                x: bounds.x + 28 * index,
                y: bounds.y,
                width: index === 0 ? 28 : 30,
                height: bounds.height,
              }}
              icon={value === GradientType.Linear ? "linear_gradient" : "radial_gradient"}
              part="buttonset_item_normal"
              hotPart="buttonset_item_hot"
              selected={type === value}
              aria-label={value === GradientType.Linear ? "Linear Gradient" : "Radial Gradient"}
              aria-pressed={type === value}
              onClick={() => onTypeChange(value)}
            />
          </Tooltip>
        </ControlFlowItem>
      ))}
      <ControlFlowItem>
        <Combobox
          bounds={{
            x: bounds.x + 66,
            y: bounds.y,
            width: bounds.width - 66,
            height: bounds.height,
          }}
          relativeTo={relativeTo}
          aria-label="Dithering matrix"
          value={dither}
          options={[
            { value: GradientDither.None, label: "No Dithering" },
            { value: GradientDither.Bayer8, label: "Bayer Matrix 8x8" },
            { value: GradientDither.Bayer4, label: "Bayer Matrix 4x4" },
            { value: GradientDither.Bayer2, label: "Bayer Matrix 2x2" },
          ]}
          onValueChange={(value) => onDitherChange(value as GradientDither)}
        />
      </ControlFlowItem>
    </>
  );
}
export interface GradientContextBarProps extends Omit<GradientOptionsProps, "bounds"> {
  origin?: { x: number; y: number };
  tolerance: number;
  contiguous: boolean;
  fillReference: ToolFillReference;
  opacity: number;
  onToleranceChange: (value: number) => void;
  onContiguousChange: (value: boolean) => void;
  onFillReferenceChange: (value: ToolFillReference) => void;
  onOpacityChange: (value: number) => void;
}
/** Owns the complete gradient field layout, so gallery/mockups only bind state.
 * Capture aseprite-light-gradient-v1-widgets.json at source GUI scale 1:
 * tolerance82, entry132, contiguous163, gear229, types248, matrix281,
 * opacity label423, slider462; coordinates here are doubled Aseprite GUI pixels. */
export function GradientContextBar({
  origin = { x: 164, y: 0 },
  relativeTo,
  viewport,
  tolerance,
  contiguous,
  fillReference,
  opacity,
  onToleranceChange,
  onContiguousChange,
  onFillReferenceChange,
  onOpacityChange,
  ...gradient
}: GradientContextBarProps) {
  const releaseEditorFocus = useReleaseEditorInputFocus();
  const bounds = (x: number, width: number): SurfaceBounds => ({
    x: origin.x + x,
    y: origin.y,
    width,
    height: 32,
  });
  const common = { relativeTo, viewport };
  return (
    <>
      <ControlFlowItem>
        <Label {...common} bounds={bounds(2, 90)} text="Tolerance:" font="mini" />
      </ControlFlowItem>
      <ControlFlowItem>
        <Input
          touchActivation={InputTouchActivation.DoubleTap}
          {...common}
          bounds={bounds(100, 54)}
          value={String(tolerance)}
          aria-label="Fill tolerance"
          inputMode="numeric"
          onCommit={(value) => {
            const number = Number(value);
            if (value.trim() && Number.isFinite(number))
              onToleranceChange(Math.max(0, Math.min(UINT8_MAX, Math.round(number))));
          }}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <Checkbox
          {...common}
          bounds={bounds(162, 124)}
          label="Contiguous"
          mini
          checked={contiguous}
          onCheckedChange={onContiguousChange}
          onCommitted={releaseEditorFocus}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <FillReferenceMenu
          {...common}
          bounds={bounds(294, 30)}
          reference={fillReference}
          onReferenceChange={onFillReferenceChange}
          iconOffset={{ x: 0, y: 0 }}
        />
      </ControlFlowItem>
      <GradientOptions {...common} {...gradient} bounds={bounds(332, 342)} />
      <ControlFlowItem>
        <Label {...common} bounds={bounds(684, 68)} text="Opacity:" font="mini" />
      </ControlFlowItem>
      <ControlFlowItem>
        <Slider
          {...common}
          bounds={bounds(760, 66)}
          variant={SliderVariant.Entry}
          min={0}
          max={UINT8_MAX}
          value={opacity}
          valueFormat="percentage"
          aria-label="Ink opacity"
          tooltip="Opacity (paint intensity)"
          onValueChange={onOpacityChange}
        />
      </ControlFlowItem>
    </>
  );
}
