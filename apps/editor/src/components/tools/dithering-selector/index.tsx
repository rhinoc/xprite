import { useCallback } from "react";

import { TOOL_CONTROL_CHANNEL_MAX as UINT8_MAX } from "$/managers/tools/tool-options";
import {
  CanvasSurface,
  type SurfaceBounds,
  type SurfaceViewport,
  Combobox,
  useUi,
} from "@xprite/ui";
import { paintUiText, useUiAssets } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";

import styles from "$/components/tools/dithering-selector/dithering-selector.module.css";

const PREVIEW_WIDTH = 128;
const PREVIEW_HEIGHT = 16;
const PREVIEW_SCALE = 2;
const PREVIEW_TEXT_LEFT = 12;
const PREVIEW_TEXT_TOP = 12;
const PREVIEW_CLIP_LEFT = 8;
const PREVIEW_CLIP_TOP = 8;
const PREVIEW_RIGHT_INSET = 46;
const GRAYSCALE_ROUNDING_EPSILON = 1e-7;
const BAYER_QUADRANTS = [
  [0, 2],
  [3, 1],
] as const;

const DITHERING_OPTIONS = [
  { value: "No Dithering", label: "No Dithering", matrixSize: 1 },
  { value: "Bayer Matrix 8x8", label: "Bayer Matrix 8x8", matrixSize: 8 },
  { value: "Bayer Matrix 4x4", label: "Bayer Matrix 4x4", matrixSize: 4 },
  { value: "Bayer Matrix 2x2", label: "Bayer Matrix 2x2", matrixSize: 2 },
] as const;

export interface DitheringSelectorProps {
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  value: string;
  onValueChange: (value: string) => void;
}

function bayerThreshold(size: number, x: number, y: number): number {
  x = ((x % size) + size) % size;
  y = ((y % size) + size) % size;
  if (size === 1) return 0;
  const half = size / 2;
  return (
    4 * bayerThreshold(half, x % half, y % half) +
    BAYER_QUADRANTS[Math.floor(y / half)][Math.floor(x / half)]
  );
}

/** Aseprite's preview-bearing dynamics matrix selector. */
export function DitheringSelector({
  bounds,
  relativeTo = { x: 0, y: 0 },
  viewport = DEFAULT_SURFACE_VIEWPORT,
  value,
  onValueChange,
}: DitheringSelectorProps) {
  const assets = useUiAssets();
  const { translateSource } = useUi();
  const name = value || DITHERING_OPTIONS[0].value;
  const displayName = translateSource(name);
  const matrixSize = DITHERING_OPTIONS.find((option) => option.value === name)?.matrixSize ?? 1;
  const layout = surfaceLayout(bounds, viewport);
  const parent = surfaceLayout({ ...relativeTo, width: 0, height: 0 }, viewport);
  const paint = useCallback(
    (context: CanvasRenderingContext2D) => {
      if (!assets) return;
      context.save();
      context.beginPath();
      context.rect(
        bounds.x + PREVIEW_CLIP_LEFT,
        bounds.y + PREVIEW_CLIP_TOP,
        bounds.width - PREVIEW_RIGHT_INSET,
        bounds.height - PREVIEW_CLIP_TOP * 2,
      );
      context.clip();
      context.fillStyle = assets.style.colors.listitem_normal_face;
      context.fillRect(
        bounds.x + PREVIEW_CLIP_LEFT,
        bounds.y + PREVIEW_CLIP_TOP,
        bounds.width - PREVIEW_RIGHT_INSET,
        bounds.height - PREVIEW_CLIP_TOP * 2,
      );
      paintUiText(
        context,
        assets,
        displayName,
        bounds.x + PREVIEW_TEXT_LEFT,
        bounds.y + PREVIEW_TEXT_TOP,
        {
          color: assets.style.colors.listitem_normal_text,
        },
      );
      for (let y = 0; y < PREVIEW_HEIGHT; y++) {
        for (let x = 0; x < PREVIEW_WIDTH; x++) {
          const threshold = bayerThreshold(matrixSize, x, y);
          const color =
            matrixSize === 1
              ? Math.trunc((x / (PREVIEW_WIDTH - 1)) * UINT8_MAX + GRAYSCALE_ROUNDING_EPSILON)
              : (x / (PREVIEW_WIDTH - 1)) * (matrixSize * matrixSize + 1) < threshold + 1
                ? 0
                : UINT8_MAX;
          context.fillStyle = `rgb(${color},${color},${color})`;
          context.fillRect(
            bounds.x + PREVIEW_TEXT_LEFT + x * PREVIEW_SCALE,
            bounds.y + 30 + y * PREVIEW_SCALE,
            PREVIEW_SCALE,
            PREVIEW_SCALE,
          );
        }
      }
      context.restore();
    },
    [assets, bounds, displayName, matrixSize],
  );

  return (
    <>
      <Combobox
        bounds={bounds}
        relativeTo={relativeTo}
        value={name}
        options={DITHERING_OPTIONS}
        onValueChange={onValueChange}
        aria-label="Dithering matrix"
      />
      <CanvasSurface
        bounds={bounds}
        viewport={viewport}
        dependencies={[assets, name]}
        aria-hidden="true"
        className={styles.preview}
        style={{ left: layout.left - parent.left, top: layout.top - parent.top }}
        paint={paint}
      />
    </>
  );
}
