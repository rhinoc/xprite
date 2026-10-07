import type { CSSProperties, HTMLAttributes } from "react";

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
  Default = "default",
  Muted = "muted",
  Danger = "danger",
}

export interface ReadingTextProps extends HTMLAttributes<HTMLElement> {
  variant: TextVariant.Reading;
  children: string;
  textRole?: TextRole;
  tone?: TextTone;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "strong";
  /** Preserve explicit newlines and wrap at the available reading width. */
  wrap?: boolean;
  ink?: string;
}

export type PixelFont = "default" | "mini";

export interface InlineTextProps {
  variant: TextVariant.Inline;
  children: string;
  className?: string;
  /** Wrap prose to the available width, preserving explicit line breaks. */
  wrap?: boolean;
  scale?: number;
  /** CSS-pixel line height for wrapped copy; glyph size still follows scale. */
  lineHeight?: number;
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

interface ControlTextContentProps extends HTMLAttributes<HTMLSpanElement> {
  variant: TextVariant.Control;
  viewport?: SurfaceViewport;
  text: string;
  font?: PixelFont;
  color?: string;
  align?: "left" | "center" | "right";
  fill?: string;
  wrap?: boolean;
}
export type ControlTextProps = ControlTextContentProps & ControlPlacement;

export type TextProps =
  | ControlTextProps
  | InlineTextProps
  | PositionedPixelTextProps
  | ReadingTextProps;
