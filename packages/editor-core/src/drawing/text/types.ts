import type { BitmapFont, PixelBuffer, Point, Rect, Rgba } from "$/base/primitives";

export interface InlineTextDraft {
  font: BitmapFont;
  bounds: Rect;
  text: string;
  scale: number;
  color: Rgba;
  selectionStart: number;
  selectionEnd: number;
  pixels: PixelBuffer;
  advances: readonly number[];
}

export interface InlineTextPosition extends Point {}
