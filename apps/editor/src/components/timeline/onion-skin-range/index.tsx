import { useCallback } from "react";

import {
  TimelineRangeHandle,
  TimelineRangeSlider,
} from "$/components/timeline/onion-skin-range/TimelineRangeSlider";
import {
  dragOnionSkinRange,
  onionSkinRangeGeometry,
  type OnionSkinSettings,
} from "$/managers/timeline/timeline-presentation";
import type { SurfaceBounds, SurfaceViewport } from "@xprite/ui";

export interface EditorOnionSkinRangeProps {
  /** Visible frame-header clipping rectangle, in UI pixels. */
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  frameWidth: number;
  scrollOffset: number;
  activeFrame: number;
  frameCount: number;
  value: OnionSkinSettings;
  onChange: (value: OnionSkinSettings) => void;
  disabled?: boolean;
}

/** Editor adapter mapping the generic timeline range slider to onion-skin settings. */
export function EditorOnionSkinRange({
  bounds,
  relativeTo,
  viewport,
  frameWidth,
  scrollOffset,
  activeFrame,
  frameCount,
  value,
  onChange,
  disabled,
}: EditorOnionSkinRangeProps) {
  const range = onionSkinRangeGeometry(value, activeFrame, frameCount, frameWidth, scrollOffset);
  const onAdjust = useCallback(
    (
      handle: TimelineRangeHandle,
      startIndex: number,
      currentIndex: number,
      startValues: readonly [number, number],
    ) => {
      const original = {
        ...value,
        previousFrames: startValues[0],
        nextFrames: startValues[1],
      };
      onChange(
        dragOnionSkinRange(
          original,
          handle === TimelineRangeHandle.Start ? "previous" : "next",
          startIndex,
          currentIndex,
        ),
      );
    },
    [onChange, value],
  );

  if (!range) return null;
  return (
    <TimelineRangeSlider
      bounds={bounds}
      relativeTo={relativeTo}
      viewport={viewport}
      range={range}
      itemWidth={frameWidth}
      scrollOffset={scrollOffset}
      values={[value.previousFrames, value.nextFrames]}
      labels={["Previous onion skin frames", "Next onion skin frames"]}
      disabled={disabled}
      onAdjust={onAdjust}
    />
  );
}
