import type { CSSProperties } from "react";

import type { FontRole } from "$/base/theme/theme-types";
import type { SurfaceBounds, SurfaceViewport } from "$/components/canvas-surface";
import type { SizedControlPlacement } from "$/components/control-flow/placement";
import type { SliderEntryProps } from "$/components/slider/variants/entry";

interface SliderPresentation {
  viewport?: SurfaceViewport;
  "aria-label"?: string;
}

export type Placement = SliderPresentation & SizedControlPlacement;

export type ValueSliderProps = Placement & {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  /** Canvas painter for dense color/alpha channel gradients. */
  paintBackground?: (context: CanvasRenderingContext2D, bounds: SurfaceBounds) => void;
  /** Font styling is independent of legacy SkinProperty::MiniLook. */
  font?: FontRole;
  disabled?: boolean;
  /** Source AlphaSlider percentage theme range; stored/input value remains 0..255. */
  alphaPercentage?: boolean;
  /** Display text; defaults to the numeric value. */
  label?: string;
};

export enum SliderOrientation {
  Horizontal = "horizontal",
  Vertical = "vertical",
}

export interface BrowserRangeSliderProps {
  className?: string;
  style?: CSSProperties;
  value: number;
  min: number;
  max: number;
  step?: number;
  orientation?: SliderOrientation;
  showTicks?: boolean;
  onValueChange: (value: number) => void;
  "aria-label": string;
  "aria-valuetext"?: string;
  disabled?: boolean;
}

export enum SliderRendering {
  Pixel = "pixel",
  NumberEntry = "number-entry",
  BrowserRange = "browser-range",
}

export enum SliderValueFormat {
  Integer = "integer",
  Percentage = "percentage",
}

export type SliderProps =
  | (ValueSliderProps & { rendering?: SliderRendering.Pixel })
  | (SliderEntryProps & { rendering: SliderRendering.NumberEntry })
  | (BrowserRangeSliderProps & { rendering: SliderRendering.BrowserRange });
