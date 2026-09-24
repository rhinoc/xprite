import type { Rgba } from "$/base/primitives";
import { rgbaToHsla, rgbaToHsva, hslaToRgba, hsvaToRgba } from "$/color/color";
import { EyedropperChannel } from "$/drawing/types";
export { EyedropperChannel, EyedropperSample } from "$/drawing/types";
/** EyedropperCommand::pickSample for the core's RGB color representation. */
export function applyEyedropperChannel(
  current: Rgba,
  picked: Rgba,
  channel: EyedropperChannel,
): Rgba {
  if (channel === EyedropperChannel.Alpha) return [current[0], current[1], current[2], picked[3]];
  if (channel === EyedropperChannel.Rgb || channel === EyedropperChannel.Color)
    return picked[3] > 0 ? [picked[0], picked[1], picked[2], current[3]] : current;
  if (channel === EyedropperChannel.Hsv || channel === EyedropperChannel.Hsl) {
    if (picked[3] === 0) return current;
    if (channel === EyedropperChannel.Hsv) {
      const [hue, saturation, value] = rgbaToHsva(picked);
      return hsvaToRgba([hue, saturation, value, current[3]]);
    }
    const [hue, saturation, lightness] = rgbaToHsla(picked);
    return hslaToRgba([hue, saturation, lightness, current[3]]);
  }
  if (channel === EyedropperChannel.Hsva) {
    const [hue, saturation, value] = rgbaToHsva(picked);
    return hsvaToRgba([hue, saturation, value, picked[3]]);
  }
  if (channel === EyedropperChannel.Hsla) {
    const [hue, saturation, lightness] = rgbaToHsla(picked);
    return hslaToRgba([hue, saturation, lightness, picked[3]]);
  }
  if (channel === EyedropperChannel.Gray || channel === EyedropperChannel.Graya) {
    if (channel === EyedropperChannel.Gray && picked[3] === 0) return current;
    const gray = Math.max(picked[0], picked[1], picked[2]);
    return [gray, gray, gray, channel === EyedropperChannel.Gray ? current[3] : picked[3]];
  }
  return [...picked] as [number, number, number, number];
}
