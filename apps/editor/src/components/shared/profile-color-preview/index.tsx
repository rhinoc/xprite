import {
  displayEditorColorInSrgb,
  parseEditorColor,
  TOOL_COLOR_CHANNEL_MAX,
  type EditorColorProfile,
} from "$/managers/tools/color-control";
import { Button, ButtonVariant } from "@xprite/ui";

/** Adapt document-profile colors to an inert themed color preview. */
export function ProfileColorPreview({
  value,
  width,
  height,
  mask = false,
  colorProfile,
}: {
  value: string;
  width: number;
  height: number;
  mask?: boolean;
  colorProfile?: EditorColorProfile;
}) {
  const [red, green, blue, alpha] = parseEditorColor(value);
  const display = displayEditorColorInSrgb(
    [red, green, blue, TOOL_COLOR_CHANNEL_MAX],
    colorProfile,
  );

  return (
    <Button
      aria-hidden="true"
      bounds={{ x: 0, y: 0, width, height }}
      readOnly
      text=""
      variant={ButtonVariant.Color}
      swatchColor={`rgba(${display.slice(0, 3).map(Math.round).join(",")}, ${mask ? 0 : alpha / TOOL_COLOR_CHANNEL_MAX})`}
      mask={mask}
    />
  );
}
