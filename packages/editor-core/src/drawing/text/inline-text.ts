import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { BitmapFont, Point, Rect, Rgba } from "$/base/primitives";
import type { InlineTextDraft } from "$/drawing/text/types";
import { clamp as clampNumber } from "@xprite/bedrock/common/clamp";
export type { InlineTextDraft } from "$/drawing/text/types";
import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";
import { measureBitmapText, paintText, validateBitmapText } from "$/drawing/text/text";

export const INLINE_TEXT_MOVE_REGION_PADDING = 32;

function textScale(value: number) {
  return clampNumber(Math.floor(value) || 1, 1, 64);
}
export function inlineTextBox(
  start: Point,
  end: Point,
  fontHeight: number,
  scale: number,
  spriteWidth: number,
): Rect {
  const bounds = {
    x: Math.min(Math.floor(start.x), Math.floor(end.x)),
    y: Math.min(Math.floor(start.y), Math.floor(end.y)),
    width: Math.abs(Math.floor(end.x) - Math.floor(start.x)) + 1,
    height: Math.abs(Math.floor(end.y) - Math.floor(start.y)) + 1,
  };
  if (bounds.width <= 3 || bounds.height <= 3) {
    const size = fontHeight * textScale(scale);
    bounds.width = Math.min(4 * size, spriteWidth);
    bounds.height = size;
  }
  return bounds;
}
export function createInlineText(
  bounds: Rect,
  font: BitmapFont,
  scale: number,
  color: Rgba,
): InlineTextDraft {
  return updateInlineText(
    {
      font,
      bounds: { ...bounds },
      text: "",
      scale: textScale(scale),
      color: [...color],
      selectionStart: 0,
      selectionEnd: 0,
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      advances: [0],
    },
    font,
    {},
  );
}
/** Pure draft replacement: unsupported glyph/allocation failures leave caller's old draft intact. */
export function updateInlineText(
  draft: InlineTextDraft,
  font: BitmapFont,
  patch: Partial<
    Pick<InlineTextDraft, "text" | "scale" | "color" | "selectionStart" | "selectionEnd">
  >,
): InlineTextDraft {
  const text = (patch.text ?? draft.text).replace(/[\r\n]/g, "").slice(0, 4096),
    scale = textScale(patch.scale ?? draft.scale),
    color = patch.color ?? draft.color;
  const clampTextOffset = (value: number) => clampNumber(Math.trunc(value), 0, text.length);
  if (
    draft.font === font &&
    text === draft.text &&
    scale === draft.scale &&
    color.every((channel, index) => channel === draft.color[index]) &&
    draft.advances.length === text.length + 1 &&
    draft.pixels.height >= font.height * scale
  )
    return {
      ...draft,
      selectionStart: clampTextOffset(patch.selectionStart ?? draft.selectionStart),
      selectionEnd: clampTextOffset(patch.selectionEnd ?? draft.selectionEnd),
    };
  const error = validateBitmapText(text, font);
  if (error) throw new RangeError(error);
  const measured = measureBitmapText(text, font, scale);
  if (
    measured.width > MAX_IMAGE_DIMENSION ||
    measured.height > MAX_IMAGE_DIMENSION ||
    measured.width * measured.height > MAX_IMAGE_PIXELS
  )
    throw new EditorAllocationError(measured.width, measured.height, "text");
  const bounds = {
    ...draft.bounds,
    width: Math.max(draft.bounds.width, measured.width),
    height: Math.max(draft.bounds.height, measured.height),
  };
  const pixels = {
    ...measured,
    data: new Uint8ClampedArray(measured.width * measured.height * 4),
  };
  paintText(pixels, { x: 0, y: 0 }, text, font, scale, {
    color,
    brush: { shape: "square", size: 1, angle: 0 },
    opacity: UINT8_MAX,
  });
  const advances = [0];
  let x = 0;
  for (const char of text) {
    x += (font.glyphs[char]?.advance ?? 0) * scale;
    for (let i = 0; i < char.length; i++) advances.push(x);
  }
  return {
    font,
    bounds,
    text,
    scale,
    color: [...color],
    pixels,
    advances,
    selectionStart: clampTextOffset(patch.selectionStart ?? draft.selectionStart),
    selectionEnd: clampTextOffset(patch.selectionEnd ?? draft.selectionEnd),
  };
}
export function moveInlineText(draft: InlineTextDraft, position: Point): InlineTextDraft {
  return {
    ...draft,
    bounds: {
      ...draft.bounds,
      x: Math.floor(position.x),
      y: Math.floor(position.y),
    },
  };
}
export function inlineTextCaretAt(draft: InlineTextDraft, x: number): number {
  for (let i = 0; i < draft.advances.length - 1; i++)
    if (x < (draft.advances[i] + draft.advances[i + 1]) / 2) return i;
  return draft.text.length;
}
