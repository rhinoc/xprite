import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "$/base/utils/cn";
import {
  DEFAULT_SURFACE_VIEWPORT,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";

import styles from "$/components/control-flow/control-flow.module.css";

const ControlFlowContext = createContext(false);

export enum ControlFlowVariant {
  Standard = "standard",
  Toolbar = "toolbar",
}

export interface ControlFlowProps extends HTMLAttributes<HTMLDivElement> {
  enabled?: boolean;
  variant?: ControlFlowVariant;
}

/** Reflows existing scene controls without changing their artwork or event handlers. */
export function ControlFlow({
  enabled = true,
  variant = ControlFlowVariant.Standard,
  className,
  children,
  ...props
}: ControlFlowProps) {
  return (
    <ControlFlowContext.Provider value={enabled}>
      <div
        {...props}
        data-ui-control-flow={variant}
        className={cn(
          enabled && styles.root,
          variant === ControlFlowVariant.Toolbar && styles.toolbar,
          className,
        )}
      >
        {children}
      </div>
    </ControlFlowContext.Provider>
  );
}

export interface ControlFlowItemProps {
  bounds?: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  children: ReactNode;
}

function sourceControlProps(children: ReactNode): ControlFlowItemProps | null {
  const nodes = Children.toArray(children);
  if (nodes.length !== 1 || !isValidElement<ControlFlowItemProps>(nodes[0])) return null;
  const props = nodes[0].props;
  return props.bounds ? props : sourceControlProps(props.children);
}

/** Keeps related controls together, rebasing their authored coordinates inside a wrapping item. */
export function ControlFlowItem({ bounds, relativeTo, viewport, children }: ControlFlowItemProps) {
  const enabled = useContext(ControlFlowContext);
  if (!enabled) return <>{children}</>;
  const source = sourceControlProps(children);
  const box = bounds ?? source?.bounds;
  if (!box) return <>{children}</>;
  const origin = relativeTo ?? source?.relativeTo ?? { x: 0, y: 0 };
  const layout = surfaceLayout(
    { ...box, x: box.x - origin.x, y: box.y - origin.y },
    viewport ?? source?.viewport ?? DEFAULT_SURFACE_VIEWPORT,
  );
  return (
    <div
      data-slot="control-flow-item"
      className={styles.item}
      style={{ width: layout.width, height: layout.height }}
    >
      <div
        className={styles.plane}
        style={{
          left: -layout.left,
          top: -layout.top,
          width: layout.left + layout.width,
          height: layout.top + layout.height,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export type {
  ControlPixelSize,
  ControlPlacement,
  PositionedControlPlacement,
  FlowControlPlacement,
  SizedControlPlacement,
} from "$/components/control-flow/placement";
