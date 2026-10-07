import type { CSSProperties, HTMLAttributes } from "react";

import type { UiPartDefinition } from "$/base/theme/theme-types";

import styles from "$/base/theme/part-surface.module.css";

type PartSurfaceProps = HTMLAttributes<HTMLSpanElement> & {
  surface: NonNullable<UiPartDefinition["surface"]>;
  colors: Record<string, string>;
  face?: string;
  ink?: string;
};

export function PartSurface({
  surface,
  colors,
  face,
  ink,
  style,
  children,
  ...props
}: PartSurfaceProps) {
  const borderColor = ink ?? colors[surface.borderRole];
  const sides = surface.borderSides ?? [true, true, true, true];
  const titlebar = surface.titlebar;
  return (
    <span
      {...props}
      style={
        {
          "--ui-surface-border-width": `${surface.borderWidth}px`,
          boxSizing: "border-box",
          borderStyle: "solid",
          borderColor: surface.pixelCircle || surface.frame ? "transparent" : borderColor,
          borderWidth: sides.map((side) => `${side ? surface.borderWidth : 0}px`).join(" "),
          borderRadius:
            typeof surface.radius === "number"
              ? surface.radius
              : (surface.radius?.map((radius) => `${radius}px`).join(" ") ?? 0),
          background: surface.pixelCircle
            ? "transparent"
            : (face ?? (surface.faceRole ? colors[surface.faceRole] : "transparent")),
          ...(surface.frame
            ? {
                background: "transparent",
                borderImageSource: surface.frame.image,
                borderImageSlice: surface.frame.slice,
                borderImageWidth: surface.frame.width,
                borderImageRepeat: "stretch" as const,
                imageRendering: "pixelated" as const,
              }
            : {}),
          boxShadow: surface.shadow
            ? `${surface.shadow}px ${surface.shadow}px 0 ${borderColor}`
            : undefined,
          ...style,
        } as CSSProperties
      }
    >
      {titlebar && (
        <span
          aria-hidden="true"
          className={styles.titlebar}
          style={
            {
              height: titlebar.height - surface.borderWidth,
              borderColor,
              "--ui-titlebar-ink": borderColor,
              "--ui-titlebar-step": `${titlebar.stripeStep}px`,
              "--ui-titlebar-inset": `${titlebar.inset}px`,
              "--ui-titlebar-stripe-height": `${(titlebar.stripeCount - 1) * titlebar.stripeStep + surface.borderWidth}px`,
              "--ui-titlebar-line-width": `${surface.borderWidth}px`,
            } as CSSProperties
          }
        />
      )}
      {children && (
        <span className={styles.surfaceContent} style={{ inset: -surface.borderWidth }}>
          {children}
        </span>
      )}
      {surface.pixelCircle && (
        <svg
          aria-hidden="true"
          className={styles.circleFrame}
          viewBox="0 0 12 12"
          shapeRendering="crispEdges"
        >
          <path
            d="M8 0H4V1H2V2H1V4H0V8H1V10H2V11H4V12H8V11H10V10H11V8H12V4H11V2H10V1H8Z"
            fill={borderColor}
          />
          <path
            d={
              surface.borderWidth > 1
                ? "M4 2H8V3H9V4H10V8H9V9H8V10H4V9H3V8H2V4H3V3H4Z"
                : "M8 1V2H10V4H11V8H10V10H8V11H4V10H2V8H1V4H2V2H4V1Z"
            }
            fill={face ?? (surface.faceRole ? colors[surface.faceRole] : "transparent")}
          />
          {surface.mark === "radio" && <path d="M8 3H4V4H3V8H4V9H8V8H9V4H8Z" fill={borderColor} />}
        </svg>
      )}
      {surface.mark && !surface.pixelCircle && (
        <svg
          aria-hidden="true"
          className={styles.circleFrame}
          viewBox="0 0 12 12"
          shapeRendering="crispEdges"
        >
          {surface.mark === "check" ? (
            Array.from({ length: 10 }, (_, i) => (
              <g key={i} fill={borderColor}>
                <rect x={i + 1} y={i + 1} width="1" height="1" />
                <rect x={10 - i} y={i + 1} width="1" height="1" />
              </g>
            ))
          ) : (
            <circle cx="6" cy="6" r="3" fill={borderColor} />
          )}
        </svg>
      )}
    </span>
  );
}
