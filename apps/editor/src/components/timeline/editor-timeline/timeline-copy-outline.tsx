import { useCallback, useEffect, useState } from "react";

import type { TimelineRangeGeometry } from "$/managers/timeline/timeline-range-geometry";
import { CanvasSurface } from "@xprite/ui";

const COPY_OUTLINE_TOP = 2;
const COPY_OUTLINE_TICK_MS = 100;
const COPY_OUTLINE_DASH_LENGTH = 4;
const COPY_OUTLINE_PERIOD = COPY_OUTLINE_DASH_LENGTH * 2;
const COPY_OUTLINE_STROKE_WIDTH = 2;
const COPY_OUTLINE_DARK = "#000000";
const COPY_OUTLINE_LIGHT = "#ffffff";

/** Animate the clipboard overlay independently of the timeline's cell artwork. */
export function TimelineCopyOutline({
  geometry,
  width,
  height,
  top,
}: {
  geometry: TimelineRangeGeometry;
  width: number;
  height: number;
  top: number;
}) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setPhase((value) => (value + 1) % COPY_OUTLINE_PERIOD),
      COPY_OUTLINE_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const paint = useCallback(
    (context: CanvasRenderingContext2D) => {
      const bounds = geometry.bounds;
      const clip = geometry.clipBounds;
      const inset = COPY_OUTLINE_STROKE_WIDTH / 2;
      context.save();
      context.beginPath();
      context.rect(clip.x, clip.y, clip.width, clip.height);
      context.clip();
      context.lineWidth = COPY_OUTLINE_STROKE_WIDTH;
      context.strokeStyle = COPY_OUTLINE_DARK;
      context.strokeRect(
        bounds.x + inset,
        bounds.y + inset,
        bounds.width - COPY_OUTLINE_STROKE_WIDTH,
        bounds.height - COPY_OUTLINE_STROKE_WIDTH,
      );
      context.setLineDash([COPY_OUTLINE_DASH_LENGTH, COPY_OUTLINE_DASH_LENGTH]);
      context.lineDashOffset = -phase;
      context.strokeStyle = COPY_OUTLINE_LIGHT;
      context.strokeRect(
        bounds.x + inset,
        bounds.y + inset,
        bounds.width - COPY_OUTLINE_STROKE_WIDTH,
        bounds.height - COPY_OUTLINE_STROKE_WIDTH,
      );
      context.restore();
    },
    [geometry, phase],
  );
  return (
    <CanvasSurface
      className="xse-timeline-selection-outline"
      bounds={{ x: 0, y: COPY_OUTLINE_TOP, width, height }}
      paint={paint}
      aria-hidden="true"
      style={{ left: 0, top }}
    />
  );
}
