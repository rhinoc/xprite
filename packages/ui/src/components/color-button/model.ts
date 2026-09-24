import type { UiStyleDefinition } from "$/base/theme/theme-types";
import { UINT8_MAX } from "$/base/utils/numeric-constants";
import type { SurfaceBounds } from "$/components/canvas-surface";

export interface ColorButtonColor {
  rgb: [number, number, number];
  alpha: number;
}

export interface ColorButtonState {
  pressed?: boolean;
  mask?: boolean;
  disabled?: boolean;
}

/** Parse the normalized CSS color forms used by the DOM color button. */
export function parseColorButtonColor(color: string): ColorButtonColor | null {
  const value = color.trim().toLowerCase();
  if (value === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value)?.[1];
  if (hex) {
    const digits = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return {
      rgb: [
        Number.parseInt(digits.slice(0, 2), 16),
        Number.parseInt(digits.slice(2, 4), 16),
        Number.parseInt(digits.slice(4, 6), 16),
      ],
      alpha: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / UINT8_MAX : 1,
    };
  }
  const channels = /^rgba?\((.*)\)$/i.exec(value)?.[1];
  if (!channels) return null;
  const [colorChannels, alphaChannel] = channels.split("/");
  const values = colorChannels
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (values.length !== 3 && values.length !== 4) return null;
  const readChannel = (raw: string) => {
    const percentage = raw.endsWith("%");
    const number = Number.parseFloat(percentage ? raw.slice(0, -1) : raw);
    return Math.round(
      Math.max(0, Math.min(UINT8_MAX, percentage ? (number * UINT8_MAX) / 100 : number)),
    );
  };
  const rawAlpha = alphaChannel?.trim() ?? values[3];
  const alpha =
    rawAlpha === undefined
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            rawAlpha.endsWith("%")
              ? Number.parseFloat(rawAlpha.slice(0, -1)) / 100
              : Number.parseFloat(rawAlpha),
          ),
        );
  const rgb = values.slice(0, 3).map(readChannel);
  if (rgb.some((channel) => !Number.isFinite(channel)) || !Number.isFinite(alpha)) return null;
  return { rgb: rgb as [number, number, number], alpha };
}

export function colorButtonSwatch(
  color: ColorButtonColor,
  { pressed = false, mask = false, disabled = false }: ColorButtonState = {},
) {
  let rgb = [...color.rgb] as [number, number, number];
  if (pressed) rgb = rgb.map((channel) => UINT8_MAX - channel) as [number, number, number];
  if (disabled && !mask) {
    // Match the source control's HSL lightness conversion for disabled swatches.
    const gray = Math.trunc((Math.max(...rgb) + Math.min(...rgb)) / 2);
    rgb = [gray, gray, gray];
  }
  return {
    rgb,
    opacity: mask ? 0 : pressed ? 1 : color.alpha,
  };
}

export interface ColorButtonFrameSlice {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Geometry for the eight Aseprite atlas border slices used by the color swatch. */
export function colorButtonFrameSlices(
  parts: UiStyleDefinition["parts"],
  bounds: SurfaceBounds,
): ColorButtonFrameSlice[] {
  const { x, y, width, height } = bounds;
  const sourceWidths = [5, 6, 5];
  const destinationWidths = [10, width - 20, 10];
  const destinationHeights = [10, height - 20, 10];
  const partNames = [
    ["colorbar_0", "colorbar_0", "colorbar_1"],
    ["colorbar_0", "colorbar_0", "colorbar_1"],
    ["colorbar_2", "colorbar_2", "colorbar_3"],
  ] as const;
  const sourceOffsets = [0, 5, 11];
  const slices: ColorButtonFrameSlice[] = [];
  let destinationY = y;
  for (let row = 0; row < 3; row++) {
    let destinationX = x;
    for (let column = 0; column < 3; column++) {
      if (row !== 1 || column !== 1) {
        const partName = partNames[row][column];
        const part = parts[partName];
        slices.push({
          sourceX: part.x + sourceOffsets[column],
          sourceY: part.y + sourceOffsets[row],
          sourceWidth: sourceWidths[column],
          sourceHeight: sourceWidths[row],
          x: destinationX,
          y: destinationY,
          width: destinationWidths[column],
          height: destinationHeights[row],
        });
      }
      destinationX += destinationWidths[column];
    }
    destinationY += destinationHeights[row];
  }
  return slices;
}
