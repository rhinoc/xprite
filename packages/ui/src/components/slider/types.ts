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

export type ThresholdSliderProps = Placement & {
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  sensorValue?: number;
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

export enum SliderMode {
  Value = "value",
  Range = "range",
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
  | (ValueSliderProps & { mode?: SliderMode.Value; rendering?: SliderRendering.Pixel })
  | (ThresholdSliderProps & { mode: SliderMode.Range; rendering?: SliderRendering.Pixel })
  | (SliderEntryProps & { mode?: SliderMode.Value; rendering: SliderRendering.NumberEntry })
  | (BrowserRangeSliderProps & {
      mode?: SliderMode.Value;
      rendering: SliderRendering.BrowserRange;
    });
