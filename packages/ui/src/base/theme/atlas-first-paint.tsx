import { useId, type CSSProperties } from "react";

import type { UiStyleDefinition } from "$/base/theme/theme-types";

import styles from "$/base/theme/theme-part.module.css";

interface SourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  slices?: number[] | null;
}
interface AtlasFirstPaintProps {
  sheetUrl: string;
  sheet: UiStyleDefinition["sheet"];
  source: SourceRegion;
  scale: number;
  scaleTop?: number;
  scaleBottom?: number;
  fill?: string;
  drawCenter?: boolean;
  tint?: string;
}

function SourceImage({
  source,
  sheet,
  sheetUrl,
  tint,
}: Pick<AtlasFirstPaintProps, "source" | "sheet" | "sheetUrl" | "tint">) {
  const maskId = useId();
  const bitmap = (
    <image
      href={sheetUrl}
      width={sheet.width}
      height={sheet.height}
      style={{ imageRendering: "pixelated" }}
    />
  );
  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      viewBox={`${source.x} ${source.y} ${source.width} ${source.height}`}
      preserveAspectRatio="none"
      style={{ overflow: "hidden", display: "block" }}
    >
      {tint ? (
        <>
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={source.x}
              y={source.y}
              width={source.width}
              height={source.height}
              style={{ maskType: "alpha" }}
            >
              {bitmap}
            </mask>
          </defs>
          <rect
            x={source.x}
            y={source.y}
            width={source.width}
            height={source.height}
            fill={tint}
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        bitmap
      )}
    </svg>
  );
}

/** Responsive atlas skins use the original pixels before browser measurements exist. */
export function AtlasFirstPaint({
  source,
  scale,
  scaleTop = scale,
  scaleBottom = scale,
  fill,
  drawCenter = false,
  ...image
}: AtlasFirstPaintProps) {
  const slices = source.slices;
  const columns = slices ? slices.slice(0, 3) : [source.width];
  const rows = slices ? slices.slice(3, 6) : [source.height];
  const tracks = (values: number[], before: number, after: number) =>
    values.length === 1
      ? "minmax(0, 1fr)"
      : `${values[0] * before}px minmax(0, 1fr) ${values[2] * after}px`;
  const style: CSSProperties = {
    gridTemplateColumns: tracks(columns, scale, scale),
    gridTemplateRows: tracks(rows, scaleTop, scaleBottom),
  };
  return (
    <span aria-hidden="true" className={styles.firstPaint} style={style}>
      {rows.flatMap((height, row) =>
        columns.map((width, column) => {
          const key = `${row}-${column}`;
          if (slices && row === 1 && column === 1 && !drawCenter)
            return <span key={key} style={{ background: fill }} />;
          const region = {
            x: source.x + columns.slice(0, column).reduce((sum, value) => sum + value, 0),
            y: source.y + rows.slice(0, row).reduce((sum, value) => sum + value, 0),
            width,
            height,
          };
          return (
            <span key={key} className={styles.firstPaintCell}>
              <SourceImage {...image} source={region} />
            </span>
          );
        }),
      )}
    </span>
  );
}
