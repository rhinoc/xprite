import type { Rgba } from "$/base/primitives";
/** Move an exact RGBA ramp match one entry in the chosen direction. Ramp ends
 * clamp, missing colors and empty ramps do nothing, and shading ignores opacity. */
export function shadePixel(
  source: Rgba,
  shade: readonly Rgba[] = [],
  direction: "left" | "right" = "left",
): Rgba {
  const index = shade.findIndex((color) =>
    color.every((value, channel) => value === source[channel]),
  );
  return index < 0
    ? source
    : shade[Math.max(0, Math.min(shade.length - 1, index + (direction === "left" ? -1 : 1)))];
}
