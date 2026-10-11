import type { CSSProperties, HTMLAttributes } from "react";

import type { FontRole } from "$/base/theme/theme-types";
import type { SurfaceViewport } from "$/components/canvas-surface/geometry";
import type { ControlPlacement } from "$/components/control-flow/placement";

export enum TextVariant {
  Control = "control",
  Inline = "inline",
  PositionedPixel = "positioned-pixel",
  Reading = "reading",
}

export enum TextRole {
  Body = "body",
  Caption = "caption",
  Heading = "heading",
  Title = "title",
}

export enum TextTone {
  Neutral = "neutral",
  Muted = "muted",
  Error = "error",
}

export enum TextInk {
  Light = "light",
  Dark = "dark",
}

export enum TextAlignment {
  Left = "left",
  Center = "center",
  Right = "right",
}

export interface ReadingTextProps extends HTMLAttributes<HTMLElement> {
  variant: TextVariant.Reading;
  children: string;
  textRole?: TextRole;
  tone?: TextTone;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "strong" | "figcaption";
  /** Preserve explicit newlines and wrap at the available reading width. */
  wrap?: boolean;
  ink?: string;
}

export interface InlineTextProps {
  variant: TextVariant.Inline;
  children: string;
  className?: string;
  /** Wrap prose to the available width, preserving explicit line breaks. */
  wrap?: boolean;
  scale?: number;
  /** CSS-pixel line height for wrapped copy; glyph size still follows scale. */
  lineHeight?: number;
  inkTone?: TextInk;
  ink?: string;
}

export interface PositionedPixelTextProps {
  variant: TextVariant.PositionedPixel;
  text: string;
  x: number;
  y: number;
  color: string;
  font?: FontRole;
  scale?: number;
  style?: CSSProperties;
  /** Use the theme's title CJK face. Tabs and window titles set this. */
  titleCjk?: boolean;
}

interface ControlTextContentProps extends HTMLAttributes<HTMLSpanElement> {
  variant: TextVariant.Control;
  viewport?: SurfaceViewport;
  text: string;
  font?: FontRole;
  color?: string;
  align?: TextAlignment;
  fill?: string;
  wrap?: boolean;
}
export type ControlTextProps = ControlTextContentProps & ControlPlacement;

export type TextProps =
  | ControlTextProps
  | InlineTextProps
  | PositionedPixelTextProps
  | ReadingTextProps;
