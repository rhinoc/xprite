import * as React from "react";

import { centerThemePixel, measureThemeText } from "$/base/components/theme-controls";
import { AtlasRegion } from "$/base/theme/atlas-region";
import { PixelSurface } from "$/base/theme/pixel-surface";
import { getThemeAssets } from "$/base/theme/theme-assets-store";
import { useTheme } from "$/base/theme/theme-context";
import type { UiPartDefinition } from "$/base/theme/theme-types";
import { computedStyle } from "$/base/utils/dom-geometry";
import type { SurfaceBounds, SurfaceViewport } from "$/components/canvas-surface";
import { surfaceLayout } from "$/components/canvas-surface";
import {
  colorButtonFrameSlices,
  colorButtonSwatch,
  parseColorButtonColor,
  type ColorButtonColor,
} from "$/components/color-button/model";
import { Text } from "$/components/text/Text";
import { TextVariant } from "$/components/text/types";

import styles from "$/components/button/variants/color/color.module.css";

const useClientLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

interface ColorArtworkProps {
  bounds: SurfaceBounds;
  viewport: SurfaceViewport;
  color: string;
  value: string;
  text?: string;
  mask: boolean;
  disabled: boolean;
  hot: boolean;
  pressed: boolean;
}

function themedSlices(
  source: UiPartDefinition,
  width: number,
  height: number,
  scale = 2,
  drawCenter = true,
) {
  if (!source.slices)
    return [
      {
        sourceX: source.x,
        sourceY: source.y,
        sourceWidth: source.width,
        sourceHeight: source.height,
        x: 0,
        y: 0,
        width,
        height,
      },
    ];
  const [left, centerWidth, right, top, centerHeight, bottom] = source.slices;
  const sourceWidths = [left, centerWidth, right];
  const sourceHeights = [top, centerHeight, bottom];
  const destinationWidths = [
    left * scale,
    Math.max(0, width - (left + right) * scale),
    right * scale,
  ];
  const destinationHeights = [
    top * scale,
    Math.max(0, height - top * scale - bottom * scale),
    bottom * scale,
  ];
  const slices: Array<{
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  let sourceY = source.y;
  let destinationY = 0;
  for (let row = 0; row < 3; row++) {
    let sourceX = source.x;
    let destinationX = 0;
    for (let column = 0; column < 3; column++) {
      const sourceWidth = sourceWidths[column];
      const sourceHeight = sourceHeights[row];
      const destinationWidth = destinationWidths[column];
      const destinationHeight = destinationHeights[row];
      const center = row === 1 && column === 1;
      if (
        (!center || drawCenter) &&
        sourceWidth &&
        sourceHeight &&
        destinationWidth &&
        destinationHeight
      )
        slices.push({
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          x: destinationX,
          y: destinationY,
          width: destinationWidth,
          height: destinationHeight,
        });
      sourceX += sourceWidth;
      destinationX += destinationWidth;
    }
    sourceY += sourceHeights[row];
    destinationY += destinationHeights[row];
  }
  return slices;
}

function checkerCells(width: number, height: number) {
  const innerWidth = width - 4,
    innerHeight = height - 4;
  const cellWidth = Math.max(2, Math.trunc(innerWidth / (innerWidth === innerHeight ? 4 : 8)) * 2);
  const cellHeight = Math.max(2, Math.trunc(innerHeight / 4) * 2);
  const cells: Array<{ x: number; y: number; width: number; height: number; dark: boolean }> = [];
  for (let y = 0; y < innerHeight; y += cellHeight)
    for (let x = 0; x < innerWidth; x += cellWidth)
      cells.push({
        x: x + 2,
        y: y + 2,
        width: Math.min(cellWidth, innerWidth - x),
        height: Math.min(cellHeight, innerHeight - y),
        dark: (x / cellWidth + y / cellHeight) % 2 !== 0,
      });
  return cells;
}

export function ColorArtwork({
  bounds,
  viewport,
  color,
  value,
  text,
  mask,
  disabled,
  hot,
  pressed,
}: ColorArtworkProps) {
  const { variant, definition: theme, translateSource } = useTheme();
  const assets = getThemeAssets(variant);
  if (!assets) throw new Error("Color artwork requires a loaded UI atlas");
  const colorProbeRef = React.useRef<HTMLSpanElement>(null);
  const [resolvedColor, setResolvedColor] = React.useState<ColorButtonColor | null>(null);
  const directColor = React.useMemo(() => parseColorButtonColor(color), [color]);
  useClientLayoutEffect(() => {
    if (directColor) {
      setResolvedColor(null);
      return;
    }
    const probe = colorProbeRef.current;
    if (!probe || !probe.style.color) {
      setResolvedColor({ rgb: [0, 0, 0], alpha: 1 });
      return;
    }
    setResolvedColor(
      parseColorButtonColor(computedStyle(probe).color) ?? { rgb: [0, 0, 0], alpha: 1 },
    );
  }, [color, directColor]);

  const baseColor = directColor ?? resolvedColor ?? { rgb: [0, 0, 0], alpha: 1 };
  const swatch = colorButtonSwatch(baseColor, { pressed, mask, disabled });
  const textLabel = translateSource(text ?? (mask ? "Mask" : value.toLowerCase()));
  const ink =
    swatch.rgb[0] * 0.299 + swatch.rgb[1] * 0.587 + swatch.rgb[2] * 0.114 > 127 ? "#000" : "#fff";
  const layout = surfaceLayout(bounds, viewport);
  const frameSlices = React.useMemo(
    () => colorButtonFrameSlices(theme.parts, bounds),
    [theme.parts, bounds.x, bounds.y, bounds.width, bounds.height],
  );
  const selectionSlices = React.useMemo(
    () =>
      hot
        ? themedSlices(theme.parts.colorbar_selection, bounds.width, bounds.height - 3, 2, false)
        : [],
    [hot, theme.parts.colorbar_selection, bounds.width, bounds.height],
  );
  const textX =
    centerThemePixel(bounds.x, bounds.width, measureThemeText(textLabel, "mini")) - bounds.x;
  const textY = centerThemePixel(bounds.y, bounds.height, 10) - bounds.y - 2;
  const showChecker = swatch.opacity < 1;
  const checker = React.useMemo(
    () => (showChecker ? checkerCells(bounds.width, bounds.height) : []),
    [bounds.width, bounds.height, showChecker],
  );
  const scaleX = layout.width / bounds.width;
  const scaleY = layout.height / bounds.height;

  return (
    <div
      aria-hidden="true"
      data-slot="color-artwork-viewport"
      className={styles.colorArtworkViewport}
      style={{ width: layout.width, height: layout.height }}
    >
      <div
        data-slot="color-artwork-plane"
        className={styles.colorArtwork}
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${scaleX}, ${scaleY})`,
        }}
      >
        {!directColor && (
          <span
            ref={colorProbeRef}
            aria-hidden="true"
            data-slot="color-probe"
            className={styles.colorProbe}
            style={{ color }}
          />
        )}
        {swatch.opacity < 1 &&
          checker.map((cell, index) => (
            <span
              key={index}
              data-slot="color-checker-cell"
              className={cell.dark ? styles.checkerDark : styles.checkerLight}
              style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height }}
            />
          ))}
        <span
          className={styles.swatchFill}
          style={{
            left: 2,
            top: 2,
            width: bounds.width - 4,
            height: bounds.height - 4,
            backgroundColor: `rgba(${swatch.rgb.join(",")}, ${swatch.opacity})`,
          }}
        />
        <PixelSurface
          aria-hidden="true"
          data-slot="color-frame"
          className={styles.atlasSurface}
          paint={(metrics) =>
            [
              ...frameSlices.map((slice) => ({
                ...slice,
                x: slice.x - bounds.x,
                y: slice.y - bounds.y,
              })),
              ...selectionSlices,
            ].map((slice, index) => (
              <AtlasRegion
                key={index}
                sheet={assets.sheet}
                source={{
                  x: slice.sourceX,
                  y: slice.sourceY,
                  width: slice.sourceWidth,
                  height: slice.sourceHeight,
                }}
                destination={{
                  x: slice.x * metrics.scaleX,
                  y: slice.y * metrics.scaleY,
                  width: slice.width * metrics.scaleX,
                  height: slice.height * metrics.scaleY,
                }}
                cssPixelScale={metrics.cssPixelScale}
              />
            ))
          }
        />
        <Text
          variant={TextVariant.PositionedPixel}
          text={textLabel}
          x={textX}
          y={textY}
          color={ink}
          font="mini"
          scale={2}
          style={{ opacity: disabled ? 125 / 255 : 1 }}
        />
      </div>
    </div>
  );
}
