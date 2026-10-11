import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "$/base/utils/cn";
import {
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";

import styles from "$/components/window/floating-layer.module.css";

export enum FloatingLayerKind {
  Window = "window",
  Popup = "popup",
}

export interface FloatingLayerProps {
  kind: FloatingLayerKind;
  bounds: SurfaceBounds;
  viewport: SurfaceViewport;
  relativeTo?: { x: number; y: number };
  className?: string;
  onRootRef?: (node: HTMLDivElement | null) => void;
  rootProps?: HTMLAttributes<HTMLDivElement>;
  children?: ReactNode;
}

/** Places arbitrary presentation in scene coordinates. The owner supplies its semantics. */
export function FloatingLayer({
  kind: variant,
  bounds,
  viewport,
  relativeTo = { x: 0, y: 0 },
  className,
  onRootRef,
  rootProps,
  children,
}: FloatingLayerProps) {
  const layout = surfaceLayout(bounds, viewport);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const isWindow = variant === FloatingLayerKind.Window;
  return (
    <div
      {...rootProps}
      ref={onRootRef}
      className={cn(isWindow ? styles.window : styles.popup, className)}
      data-overlay={variant}
      data-slot="overlay"
      data-floating-window={isWindow ? "" : undefined}
      data-popup={!isWindow ? "" : undefined}
      style={{
        ...rootProps?.style,
        left: layout.left - Math.floor(relativeTo.x * sx),
        top: layout.top - Math.floor(relativeTo.y * sy),
        width: layout.width,
        height: layout.height,
      }}
    >
      {children}
    </div>
  );
}
