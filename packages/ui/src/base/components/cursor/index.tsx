import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { defaultUiTheme } from "$/base/theme/default-theme";
import { useTheme } from "$/base/theme/theme-context";
import type { UiTheme, UiCursorArtwork } from "$/base/theme/theme-definition";

import styles from "$/base/components/cursor/cursor.module.css";
export const cursorScopeClassName = styles.cursorScope;

const CURSOR_FALLBACKS = {
  crosshair: "crosshair",
  eyedropper: "crosshair",
  forbidden: "not-allowed",
  hand: "grab",
  magnifier: "zoom-in",
  move: "move",
  move_selection: "move",
  normal: "default",
  normal_add: "copy",
  scroll: "grabbing",
  rotate_e: "crosshair",
  rotate_n: "crosshair",
  rotate_ne: "crosshair",
  rotate_nw: "crosshair",
  rotate_s: "crosshair",
  rotate_se: "crosshair",
  rotate_sw: "crosshair",
  rotate_w: "crosshair",
  size_e: "e-resize",
  size_n: "n-resize",
  size_ne: "ne-resize",
  size_nw: "nw-resize",
  size_ns: "ns-resize",
  size_s: "s-resize",
  size_se: "se-resize",
  size_sw: "sw-resize",
  size_w: "w-resize",
  size_we: "ew-resize",
  skew_e: "e-resize",
  skew_n: "n-resize",
  skew_ne: "ne-resize",
  skew_nw: "nw-resize",
  skew_s: "s-resize",
  skew_se: "se-resize",
  skew_sw: "sw-resize",
  skew_w: "w-resize",
} as const;

export type CursorRole = keyof typeof CURSOR_FALLBACKS;

/** Read artwork from the selected theme for canvas or non-DOM presentations. */
export function getCursorArtwork(
  role: CursorRole,
  theme: UiTheme = defaultUiTheme,
): UiCursorArtwork {
  const artwork = theme.cursors[role];
  if (!artwork) throw new Error(`Theme ${theme.id} has no cursor artwork for ${role}`);
  return artwork;
}

type Direction = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type CursorName =
  | CursorRole
  | "move-selection"
  | `scale-${Direction}`
  | `rotate-${Direction}`
  | `skew-${Direction}`;

const MIN_CURSOR_SCALE = 1;
const MAX_CURSOR_SCALE = 4;
const cursorCaches = new WeakMap<UiTheme["cursors"], Map<string, string>>();
const cursorVariable = (role: CursorRole) =>
  `--ui-cursor-${role === "normal" ? "default" : role === "normal_add" ? "copy" : role === "forbidden" ? "disabled" : role.replaceAll("_", "-")}`;

function artworkCursor(
  role: CursorRole,
  scale: number,
  fallback: string,
  theme: UiTheme,
  artworkUrl?: (svg: string) => string,
) {
  const artwork = theme.cursors[role];
  if (!artwork) return fallback;
  if (artworkUrl) {
    const svg = scaledCursorSvg(artwork, scale);
    return cursorValue(artworkUrl(svg), artwork, scale, fallback);
  }
  let cache = cursorCaches.get(theme.cursors);
  if (!cache) {
    cache = new Map();
    cursorCaches.set(theme.cursors, cache);
  }
  const key = `${role}:${scale}:${fallback}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const svg = scaledCursorSvg(artwork, scale);
  const result = cursorValue(
    `data:image/svg+xml,${encodeURIComponent(svg)}`,
    artwork,
    scale,
    fallback,
  );
  cache.set(key, result);
  return result;
}

function scaledCursorSvg(artwork: UiCursorArtwork, scale: number) {
  return artwork.svg
    .replace(`width="${artwork.width}"`, `width="${artwork.width * scale}"`)
    .replace(`height="${artwork.height}"`, `height="${artwork.height * scale}"`);
}

function cursorValue(url: string, artwork: UiCursorArtwork, scale: number, fallback: string) {
  const centerOffset = Math.floor(scale / 2);
  return `url(${JSON.stringify(url)}) ${artwork.hotspot.x * scale + centerOffset} ${artwork.hotspot.y * scale + centerOffset}, ${fallback}`;
}

/** Cursor roles inherit the subtree's artwork size or system-cursor preference. */
export function cursorStyle(name: CursorName, fallback = "default") {
  const role = (
    name === "move-selection"
      ? "move_selection"
      : name.startsWith("scale-")
        ? name.replace("scale-", "size_")
        : name.replace("-", "_")
  ) as CursorRole;
  return `var(${cursorVariable(role)}, ${fallback})`;
}

/** Generic UI cursor configuration, also usable on an existing scope element. */
export function cursorScopeStyle({
  native = false,
  scale = MIN_CURSOR_SCALE,
  theme = defaultUiTheme,
  artworkUrl,
}: {
  native?: boolean;
  scale?: number;
  theme?: UiTheme;
  /** Map cursor SVG markup to a URL, e.g. a hashed file; defaults to an inline data URI. */
  artworkUrl?: (svg: string) => string;
}): CSSProperties {
  const resolvedScale = Number.isFinite(scale)
    ? Math.max(MIN_CURSOR_SCALE, Math.min(MAX_CURSOR_SCALE, Math.trunc(scale)))
    : MIN_CURSOR_SCALE;
  return Object.fromEntries(
    Object.entries(CURSOR_FALLBACKS).map(([name, fallback]) => {
      const role = name as CursorRole;
      return [
        cursorVariable(role),
        native ? fallback : artworkCursor(role, resolvedScale, fallback, theme, artworkUrl),
      ];
    }),
  ) as CSSProperties;
}

export interface CursorProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /**
   * Write the cursor artwork variables inline. Disable when a stylesheet already defines them,
   * e.g. prerendered pages where every server-rendered scope would repeat ~0.5 MB of SVG.
   */
  variables?: boolean;
}

/** Makes the package cursor variables available to a subtree without adding a layout box. */
export function CursorProvider({
  children,
  className,
  style,
  variables = true,
  ...props
}: CursorProviderProps) {
  const { uiTheme } = useTheme();
  return (
    <div
      {...props}
      style={variables ? { ...cursorScopeStyle({ theme: uiTheme }), ...style } : style}
      className={[styles.scope, styles.cursorScope, className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

export interface CursorImageProps {
  source: string;
  width: number;
  height: number;
  hotspot: { x: number; y: number };
  point: { x: number; y: number };
}

/** Render an existing cursor bitmap at its exact hotspot; never synthesize an outline. */
export function CursorImage({ source, width, height, hotspot, point }: CursorImageProps) {
  return (
    <img
      src={source}
      alt=""
      aria-hidden
      draggable={false}
      className={styles.image}
      style={{ width, height, left: point.x - hotspot.x, top: point.y - hotspot.y }}
    />
  );
}
