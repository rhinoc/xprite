import type { CSSProperties } from "react";

import type { SurfaceBounds, SurfaceViewport } from "$/components/canvas-surface";
import type { SizedControlPlacement } from "$/components/control-flow/placement";
import type { SliderEntryProps } from "$/components/slider/variants/entry";

interface SliderPresentation {
  viewport?: SurfaceViewport;
  "aria-label"?: string;
}

export type Placement = SliderPresentation & SizedControlPlacement;

export type ScalarSliderProps = Placement & {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  /** Canvas painter for dense color/alpha channel gradients. */
  paintBackground?: (context: CanvasRenderingContext2D, bounds: SurfaceBounds) => void;
  /** Font styling is independent of legacy SkinProperty::MiniLook. */
  font?: "default" | "mini";
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

export interface NativeSliderProps {
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

export enum SliderVariant {
  Normal = "normal",
  Threshold = "threshold",
  Entry = "entry",
  Native = "native",
}

export type SliderProps =
  | (ScalarSliderProps & { variant?: SliderVariant.Normal })
  | (ThresholdSliderProps & { variant: SliderVariant.Threshold })
  | (SliderEntryProps & { variant: SliderVariant.Entry })
  | (NativeSliderProps & { variant: SliderVariant.Native });
