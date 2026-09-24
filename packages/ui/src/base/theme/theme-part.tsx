import { memo, type CSSProperties, type HTMLAttributes } from "react";

import { AtlasRegion } from "$/base/theme/atlas-region";
import { PixelSurface } from "$/base/theme/pixel-surface";
import { getThemeAssets, type UiBitmap } from "$/base/theme/theme-assets-store";
import { useTheme, type AtlasPartName } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import type { ElementSize } from "$/base/utils/dom-geometry";

import styles from "$/base/theme/theme-part.module.css";

export type { AtlasPartName } from "$/base/theme/theme-context";
export type UiPartName = AtlasPartName;

type PartGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  slices: number[] | null;
};

/** Icons and nine-slice skins share the same atlas pixels and drawing surface. */
export function ThemeIcon({
  part,
  x,
  y,
  color,
  scale = 1,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  part: AtlasPartName;
  x?: number;
  y?: number;
  color?: string;
  scale?: number;
}) {
  const { definition: theme, variant } = useTheme();
  const assets = getThemeAssets(variant);
  if (!assets) throw new Error("Theme icon requires a loaded UI atlas");
  const source = theme.parts[part];
  return (
    <PixelSurface
      {...props}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn(styles.themeIcon, className)}
      data-theme-part={part}
      style={{
        position: x !== undefined || y !== undefined ? "absolute" : "relative",
        left: x,
        top: y,
        width: source.width * scale,
        height: source.height * scale,
        ...style,
      }}
      paint={(metrics) => (
        <AtlasRegion
          sheet={assets.sheet}
          source={source}
          destination={{ x: 0, y: 0, width: metrics.width, height: metrics.height }}
          cssPixelScale={metrics.cssPixelScale}
          tint={color}
        />
      )}
    />
  );
}

export interface UiPartProps extends HTMLAttributes<HTMLSpanElement> {
  part: AtlasPartName;
  /** Source theme pixels per logical UI pixel. Presentation scale belongs to the surface. */
  scale?: number;
  scaleTop?: number;
  scaleBottom?: number;
  fill?: string;
  drawCenter?: boolean;
}

/** Compose one skin directly on the target physical pixel grid for every scale. */
export function ThemePart({
  part,
  scale = 1,
  scaleTop,
  scaleBottom,
  fill,
  drawCenter = false,
  className,
  style,
  children,
  ...props
}: UiPartProps) {
  const { definition: theme, variant } = useTheme();
  const assets = getThemeAssets(variant);
  if (!assets) throw new Error("Theme skin requires a loaded UI atlas");
  const source: PartGeometry = theme.parts[part];
  const slices = source.slices;
  const geometryStyle = {
    "--xse-theme-min-width": `${(slices ? slices[0] + slices[2] : source.width) * scale}px`,
    "--xse-theme-min-height": `${(slices ? slices[3] + slices[5] : source.height) * scale}px`,
    ...style,
  } as CSSProperties;
  return (
    <PixelSurface
      {...props}
      className={cn(styles.themePart, className)}
      data-slot="theme-part"
      data-theme-part={part}
      style={geometryStyle}
      paint={(metrics) => (
        <ThemeSkinContent
          source={source}
          sheet={assets.sheet}
          scale={scale * metrics.scaleX}
          scaleTop={(scaleTop ?? scale) * metrics.scaleY}
          scaleBottom={(scaleBottom ?? scale) * metrics.scaleY}
          fill={fill}
          drawCenter={drawCenter}
          size={metrics}
          cssPixelScale={metrics.cssPixelScale}
        />
      )}
    >
      {children}
    </PixelSurface>
  );
}

interface ThemeSkinProps {
  source: PartGeometry;
  sheet: UiBitmap;
  scale: number;
  scaleTop?: number;
  scaleBottom?: number;
  fill?: string;
  drawCenter: boolean;
}

/** Keep source-space clipping so adjacent atlas pixels sample exactly as before. */
const ThemeSkinContent = memo(
  function ThemeSkinContent({
    source,
    sheet,
    scale,
    scaleTop = scale,
    scaleBottom = scale,
    fill,
    drawCenter,
    size,
    cssPixelScale,
  }: ThemeSkinProps & {
    size: ElementSize;
    cssPixelScale: { x: number; y: number };
  }) {
    const slices = source.slices;
    const columns = slices ? slices.slice(0, 3) : [source.width];
    const rows = slices ? slices.slice(3, 6) : [source.height];
    const tracks = (values: number[], extent: number, beforeScale: number, afterScale: number) => {
      const snap = Math.round;
      if (values.length === 1) return { sizes: [extent], offsets: [0] };
      // Snap shared cut positions, then derive both adjacent slices from the same
      // boundary. Keep the outer extent exact so no strip of the control is left bare.
      const before = Math.min(extent, Math.max(0, snap(values[0] * beforeScale)));
      const afterStart = Math.min(extent, Math.max(before, snap(extent - values[2] * afterScale)));
      return {
        sizes: [before, afterStart - before, extent - afterStart],
        offsets: [0, before, afterStart],
      };
    };
    const horizontal = tracks(columns, size.width, scale, scale);
    const vertical = tracks(rows, size.height, scaleTop, scaleBottom);
    return (
      <>
        {rows.flatMap((height, row) =>
          columns.map((width, column) => {
            if (!width || !height) return null;
            const x = source.x + columns.slice(0, column).reduce((sum, value) => sum + value, 0);
            const y = source.y + rows.slice(0, row).reduce((sum, value) => sum + value, 0);
            const targetX = horizontal.offsets[column];
            const targetY = vertical.offsets[row];
            const targetWidth = horizontal.sizes[column];
            const targetHeight = vertical.sizes[row];
            const key = `${row}-${column}`;
            if (slices && row === 1 && column === 1 && !drawCenter) {
              return fill ? (
                <span
                  key={key}
                  className={styles.themePixelBlock}
                  style={{
                    left: targetX * cssPixelScale.x,
                    top: targetY * cssPixelScale.y,
                    width: targetWidth * cssPixelScale.x,
                    height: targetHeight * cssPixelScale.y,
                    backgroundColor: fill,
                  }}
                />
              ) : null;
            }
            return (
              <AtlasRegion
                key={key}
                sheet={sheet}
                source={{ x, y, width, height }}
                destination={{ x: targetX, y: targetY, width: targetWidth, height: targetHeight }}
                cssPixelScale={cssPixelScale}
              />
            );
          }),
        )}
      </>
    );
  },
  (previous, next) =>
    previous.source === next.source &&
    previous.sheet === next.sheet &&
    previous.scale === next.scale &&
    previous.scaleTop === next.scaleTop &&
    previous.scaleBottom === next.scaleBottom &&
    previous.fill === next.fill &&
    previous.drawCenter === next.drawCenter &&
    previous.size.width === next.size.width &&
    previous.size.height === next.size.height &&
    previous.cssPixelScale.x === next.cssPixelScale.x &&
    previous.cssPixelScale.y === next.cssPixelScale.y,
);
