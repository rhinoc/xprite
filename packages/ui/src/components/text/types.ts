import type { CSSProperties } from "react";

export enum TextVariant {
  Inline = "inline",
  PositionedPixel = "positioned-pixel",
}

export type PixelFont = "default" | "mini";

export interface InlineTextProps {
  variant: TextVariant.Inline;
  children: string;
  className?: string;
  /** Wrap prose to the available width, preserving explicit line breaks. */
  wrap?: boolean;
  scale?: number;
  color?: "dark" | "light";
  ink?: string;
}

export interface PositionedPixelTextProps {
  variant: TextVariant.PositionedPixel;
  text: string;
  x: number;
  y: number;
  color: string;
  font?: PixelFont;
  scale?: number;
  style?: CSSProperties;
}

export type TextProps = InlineTextProps | PositionedPixelTextProps;
