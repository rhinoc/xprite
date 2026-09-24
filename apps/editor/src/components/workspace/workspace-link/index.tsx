import {
  useState,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Text, TextVariant, type SurfaceBounds, type SurfaceViewport } from "@xprite/ui";
import { useUi } from "@xprite/ui";
import { centerUiPixel } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";

import styles from "$/components/workspace/workspace-link/workspace-link.module.css";

export enum WorkspaceLinkVariant {
  Workspace = "workspace",
  Recent = "recent",
  Inline = "inline",
}

const LINK_TEXT_HEIGHT = 14;
const RECENT_TEXT_INSET = 4;
const INLINE_TEXT_INSET = 2;

function placement(
  bounds: SurfaceBounds,
  relativeTo: { x: number; y: number },
  viewport: SurfaceViewport,
): CSSProperties {
  const layout = surfaceLayout(bounds, viewport);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  return {
    position: "absolute",
    left: layout.left - Math.floor(relativeTo.x * sx),
    top: layout.top - Math.floor(relativeTo.y * sy),
    width: layout.width,
    height: layout.height,
  };
}

export interface WorkspaceLinkProps {
  bounds: SurfaceBounds;
  children: string;
  leading?: ReactNode;
  layout?: "positioned" | "flow";
  className?: string;
  style?: CSSProperties;
  color?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: WorkspaceLinkVariant;
  relativeTo?: { x: number; y: number };
  viewport?: SurfaceViewport;
  onHotChange?: (hot: boolean) => void;
  highlighted?: boolean;
}

/** Themed Aseprite workspace, recent-file, and inline link control. */
export function WorkspaceLink({
  bounds,
  children,
  leading,
  layout = "positioned",
  className,
  style: customStyle,
  color,
  href,
  onClick,
  disabled = false,
  variant = WorkspaceLinkVariant.Workspace,
  relativeTo = { x: 0, y: 0 },
  viewport = DEFAULT_SURFACE_VIEWPORT,
  onHotChange,
  highlighted = false,
}: WorkspaceLinkProps) {
  const { translateSource, style: uiStyle } = useUi();
  const displayText =
    variant === WorkspaceLinkVariant.Recent ? children : translateSource(children);
  const [hot, setHot] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hover = (value: boolean) => {
    setHot(value);
    onHotChange?.(value);
  };
  const isHot = hot || highlighted;
  const colors = uiStyle.colors;
  const inline = variant === WorkspaceLinkVariant.Inline;
  const labelColor =
    variant === WorkspaceLinkVariant.Recent
      ? pressed && isHot
        ? colors.listitem_selected_text
        : colors.text
      : isHot && !disabled
        ? colors[inline ? "link_hover" : "workspace_link_hover"]
        : (color ?? colors[inline ? "link_text" : "workspace_link"]);
  const backgroundColor =
    variant !== WorkspaceLinkVariant.Recent
      ? "transparent"
      : pressed && isHot
        ? colors.listitem_selected_face
        : isHot && !disabled
          ? colors.menuitem_hot_face
          : colors.background;
  const labelContent =
    layout === "flow" ? (
      <span
        className={`${styles.artwork} ${styles.flowArtwork}`}
        aria-hidden="true"
        style={{
          paddingLeft:
            variant === WorkspaceLinkVariant.Recent
              ? RECENT_TEXT_INSET
              : inline
                ? INLINE_TEXT_INSET
                : 0,
        }}
      >
        {leading}
        <Text variant={TextVariant.Inline} scale={2} ink={labelColor}>
          {displayText}
        </Text>
      </span>
    ) : (
      <span className={styles.artwork} aria-hidden="true">
        <Text
          variant={TextVariant.PositionedPixel}
          text={displayText}
          x={
            variant === WorkspaceLinkVariant.Recent
              ? RECENT_TEXT_INSET
              : inline
                ? INLINE_TEXT_INSET
                : 0
          }
          y={centerUiPixel(bounds.y, bounds.height, LINK_TEXT_HEIGHT) - bounds.y}
          color={labelColor}
        />
      </span>
    );
  const rootStyle = {
    ...(layout === "positioned" ? placement(bounds, relativeTo, viewport) : {}),
    ...customStyle,
    color: labelColor,
    backgroundColor,
  };
  const rootClassName = [styles.root, layout === "flow" && styles.flow, className]
    .filter(Boolean)
    .join(" ");
  const interactions = {
    onPointerEnter: () => hover(true),
    onPointerLeave: () => hover(false),
    onFocus: () => hover(true),
    onBlur: () => {
      hover(false);
      setPressed(false);
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button === 0) setPressed(true);
    },
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === " " || event.key === "Enter") setPressed(true);
    },
    onKeyUp: () => setPressed(false),
  };

  if (href && !disabled) {
    return (
      <a
        {...interactions}
        className={rootClassName}
        data-variant={variant}
        aria-label={displayText}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        style={rootStyle}
      >
        {labelContent}
      </a>
    );
  }

  return (
    <button
      {...interactions}
      type="button"
      className={rootClassName}
      data-variant={variant}
      aria-label={displayText}
      disabled={disabled}
      onClick={onClick}
      style={rootStyle}
    >
      {labelContent}
    </button>
  );
}
