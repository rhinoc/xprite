import {
  ColorChannel,
  colorChannelValue,
  colorProfileToSrgb,
  hexToRgba,
  hslaToRgba,
  hsvaToRgba,
  paletteColorIndex,
  rgbaToHex,
  rgbaToHsla,
  rgbaToHsva,
  setColorChannel,
  setHslaChannel,
  setHsvaChannel,
  UINT8_MAX,
  type Hsla,
  type Hsva,
  type Rgba,
} from "@xprite/editor-core";
import type { AsepriteColorProfile } from "@xprite/editor-core/import-export";

/** Color-control value types used by the editor UI. */
export type EditorColor = Rgba;
export type EditorHsla = Hsla;
export type EditorHsva = Hsva;
export type EditorColorProfile = AsepriteColorProfile;
export const ToolColorChannel = ColorChannel;
export type ToolColorChannel = ColorChannel;
export type EditorHsvaChannel =
  | ColorChannel.Hue
  | ColorChannel.Saturation
  | ColorChannel.Value
  | ColorChannel.Alpha;
export type EditorHslaChannel =
  | ColorChannel.Hue
  | ColorChannel.Saturation
  | ColorChannel.Lightness
  | ColorChannel.Alpha;
export const TOOL_COLOR_CHANNEL_MAX = UINT8_MAX;

export function parseEditorColor(value: string): EditorColor {
  return hexToRgba(value);
}

export function formatEditorColor(value: readonly number[]): string {
  return rgbaToHex(value);
}

export function editorColorToHsva(value: readonly number[]): EditorHsva {
  return rgbaToHsva(value);
}

export function editorColorToHsla(value: readonly number[]): EditorHsla {
  return rgbaToHsla(value);
}

export function hsvaToEditorColor(value: readonly number[]): EditorColor {
  return hsvaToRgba(value);
}

export function hslaToEditorColor(value: readonly number[]): EditorColor {
  return hslaToRgba(value);
}

export function editorColorChannelValue(
  color: EditorColor,
  channel: ToolColorChannel,
  rememberedHue?: number,
): number {
  return colorChannelValue(color, channel, rememberedHue);
}

export function setEditorColorChannel(
  color: EditorColor,
  channel: ToolColorChannel,
  value: number,
): EditorColor {
  return setColorChannel(color, channel, value);
}

export function setEditorHsvaChannel(
  color: EditorHsva,
  channel: EditorHsvaChannel,
  value: number,
): EditorHsva {
  return setHsvaChannel(color, channel, value);
}

export function setEditorHslaChannel(
  color: EditorHsla,
  channel: EditorHslaChannel,
  value: number,
): EditorHsla {
  return setHslaChannel(color, channel, value);
}

export function displayEditorColorInSrgb(
  color: EditorColor,
  profile?: EditorColorProfile,
): EditorColor {
  return colorProfileToSrgb(color, profile);
}

export function findEditorPaletteColor(
  palette: readonly (readonly number[])[],
  color: EditorColor,
): number {
  return paletteColorIndex(palette, color);
}
