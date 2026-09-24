import type { EditorTextFontOptions } from "$/managers/ports/platform";
import { bitmapTextFontSize, normalizeTextFontSize, type ToolSettings } from "@xprite/editor-core";

export {
  TextFontFamily,
  DEFAULT_TEXT_FONT_SIZE,
  bitmapTextFontSize,
  normalizeTextFontSize,
} from "@xprite/editor-core";

export function editorTextFontOptions(settings: ToolSettings): EditorTextFontOptions {
  return {
    family: settings.textFontFamily,
    size: normalizeTextFontSize(settings.textFontSize),
    antialias: settings.textAntialias,
    bold: settings.textBold,
    italic: settings.textItalic,
    fill: settings.textFill,
    strokeWidth: settings.textStrokeWidth,
  };
}

export function textFontSettings(options: EditorTextFontOptions): Partial<ToolSettings> {
  return {
    textFontFamily: options.family,
    textFontSize: options.size,
    textAntialias: options.antialias,
    textBold: bitmapTextFontSize(options.family) ? false : options.bold,
    textItalic: options.italic,
    textFill: options.fill,
    textStrokeWidth: options.strokeWidth,
    textScale: 1,
  };
}

const STANDARD_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 22, 24, 26, 28, 36, 48, 72];

export function textFontSizeOptions(family: string) {
  const base = bitmapTextFontSize(family);
  const sizes = [
    ...new Set([...STANDARD_FONT_SIZES, ...(base ? [base, base * 2, base * 3] : [])]),
  ].sort((a, b) => a - b);
  return sizes.map((size) => ({
    value: String(size),
    label: `${size}${base && size % base === 0 ? "*" : ""}`,
  }));
}
