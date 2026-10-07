import type { CSSProperties } from "react";

import "$/components/surface/surface.module.css";

/** Semantic colors supplied by the active theme. */
export enum SurfaceTone {
  Neutral = "neutral",
  Accent = "accent",
  Informative = "informative",
  Positive = "positive",
  Warning = "warning",
}

export enum ContentLayout {
  Flow = "flow",
  Column = "column",
  Fill = "fill",
}

export enum ContentPadding {
  None = "none",
  Compact = "compact",
  Standard = "standard",
  Spacious = "spacious",
}

export enum ContentAlign {
  Stretch = "stretch",
  Start = "start",
  Center = "center",
  End = "end",
}

export interface SurfaceContentProps {
  tone?: SurfaceTone;
  /** Fill shares the available height with the content and allows nested scrolling. */
  contentLayout?: ContentLayout;
  /** A theme spacing preset, or an explicit inset in CSS pixels. */
  contentPadding?: ContentPadding | number;
  /** Space between children in Column and Fill layouts, in CSS pixels. */
  contentGap?: number;
  contentAlign?: ContentAlign;
}

export function surfaceAttributes({
  tone,
  contentLayout,
  contentPadding,
  contentAlign,
}: SurfaceContentProps) {
  return {
    "data-ui-surface": true,
    "data-ui-surface-tone": tone,
    "data-ui-content-layout": contentLayout,
    "data-ui-content-align": contentAlign,
    "data-ui-content-padding": typeof contentPadding === "number" ? "custom" : contentPadding,
  };
}

export function surfaceStyle(
  { contentPadding, contentGap }: SurfaceContentProps,
  style?: CSSProperties,
): CSSProperties | undefined {
  if (typeof contentPadding !== "number" && contentGap === undefined) return style;
  return {
    ...(typeof contentPadding === "number"
      ? { "--ui-content-padding": `${contentPadding}px` }
      : {}),
    ...(contentGap === undefined ? {} : { "--ui-content-gap": `${contentGap}px` }),
    ...style,
  } as CSSProperties;
}
