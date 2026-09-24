import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import crosshair from "$assets/cursors/aseprite/crosshair.svg?raw";
import eyedropper from "$assets/cursors/aseprite/eyedropper.svg?raw";
import forbidden from "$assets/cursors/aseprite/forbidden.svg?raw";
import hand from "$assets/cursors/aseprite/hand.svg?raw";
import magnifier from "$assets/cursors/aseprite/magnifier.svg?raw";
import manifest from "$assets/cursors/aseprite/manifest.json";
import move from "$assets/cursors/aseprite/move.svg?raw";
import move_selection from "$assets/cursors/aseprite/move_selection.svg?raw";
import normal from "$assets/cursors/aseprite/normal.svg?raw";
import normal_add from "$assets/cursors/aseprite/normal_add.svg?raw";
import rotate_e from "$assets/cursors/aseprite/rotate_e.svg?raw";
import rotate_n from "$assets/cursors/aseprite/rotate_n.svg?raw";
import rotate_ne from "$assets/cursors/aseprite/rotate_ne.svg?raw";
import rotate_nw from "$assets/cursors/aseprite/rotate_nw.svg?raw";
import rotate_s from "$assets/cursors/aseprite/rotate_s.svg?raw";
import rotate_se from "$assets/cursors/aseprite/rotate_se.svg?raw";
import rotate_sw from "$assets/cursors/aseprite/rotate_sw.svg?raw";
import rotate_w from "$assets/cursors/aseprite/rotate_w.svg?raw";
import scroll from "$assets/cursors/aseprite/scroll.svg?raw";
import size_e from "$assets/cursors/aseprite/size_e.svg?raw";
import size_n from "$assets/cursors/aseprite/size_n.svg?raw";
import size_ne from "$assets/cursors/aseprite/size_ne.svg?raw";
import size_ns from "$assets/cursors/aseprite/size_ns.svg?raw";
import size_nw from "$assets/cursors/aseprite/size_nw.svg?raw";
import size_s from "$assets/cursors/aseprite/size_s.svg?raw";
import size_se from "$assets/cursors/aseprite/size_se.svg?raw";
import size_sw from "$assets/cursors/aseprite/size_sw.svg?raw";
import size_w from "$assets/cursors/aseprite/size_w.svg?raw";
import size_we from "$assets/cursors/aseprite/size_we.svg?raw";
import skew_e from "$assets/cursors/aseprite/skew_e.svg?raw";
import skew_n from "$assets/cursors/aseprite/skew_n.svg?raw";
import skew_ne from "$assets/cursors/aseprite/skew_ne.svg?raw";
import skew_nw from "$assets/cursors/aseprite/skew_nw.svg?raw";
import skew_s from "$assets/cursors/aseprite/skew_s.svg?raw";
import skew_se from "$assets/cursors/aseprite/skew_se.svg?raw";
import skew_sw from "$assets/cursors/aseprite/skew_sw.svg?raw";
import skew_w from "$assets/cursors/aseprite/skew_w.svg?raw";

import styles from "$/base/components/cursor/cursor.module.css";
export const cursorScopeClassName = styles.cursorScope;

const artwork = {
  crosshair,
  eyedropper,
  forbidden,
  hand,
  magnifier,
  move,
  move_selection,
  normal,
  normal_add,
  rotate_e,
  rotate_n,
  rotate_ne,
  rotate_nw,
  rotate_s,
  rotate_se,
  rotate_sw,
  rotate_w,
  scroll,
  size_e,
  size_n,
  size_ne,
  size_ns,
  size_nw,
  size_s,
  size_se,
  size_sw,
  size_w,
  size_we,
  skew_e,
  skew_n,
  skew_ne,
  skew_nw,
  skew_s,
  skew_se,
  skew_sw,
  skew_w,
};

export type CursorRole = keyof typeof artwork;
type Direction = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type CursorName =
  | CursorRole
  | "move-selection"
  | `scale-${Direction}`
  | `rotate-${Direction}`
  | `skew-${Direction}`;

const CURSOR_BASE_SIZE = 16;
const MIN_CURSOR_SCALE = 1;
const MAX_CURSOR_SCALE = 4;
const cursorCache = new Map<string, string>();
const cursorVariable = (role: CursorRole) =>
  `--ui-cursor-${role === "normal" ? "default" : role === "normal_add" ? "copy" : role === "forbidden" ? "disabled" : role.replaceAll("_", "-")}`;

function artworkCursor(role: CursorRole, scale: number, fallback: string) {
  const key = `${role}:${scale}:${fallback}`;
  const cached = cursorCache.get(key);
  if (cached) return cached;
  const size = CURSOR_BASE_SIZE * scale;
  const svg = artwork[role]
    .replace(/width="16"/, `width="${size}"`)
    .replace(/height="16"/, `height="${size}"`);
  const hotspot = manifest.cursors[role].sizes["16"];
  const centerOffset = Math.floor(scale / 2);
  const result = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot.hotspotX * scale + centerOffset} ${hotspot.hotspotY * scale + centerOffset}, ${fallback}`;
  cursorCache.set(key, result);
  return result;
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
  return `var(${cursorVariable(role)}, ${artworkCursor(role, MIN_CURSOR_SCALE, fallback)})`;
}

/** Generic UI cursor configuration, also usable on an existing scope element. */
export function cursorScopeStyle({
  native = false,
  scale = MIN_CURSOR_SCALE,
}: {
  native?: boolean;
  scale?: number;
}): CSSProperties {
  const resolvedScale = Number.isFinite(scale)
    ? Math.max(MIN_CURSOR_SCALE, Math.min(MAX_CURSOR_SCALE, Math.trunc(scale)))
    : MIN_CURSOR_SCALE;
  return Object.fromEntries(
    Object.keys(artwork).map((name) => {
      const role = name as CursorRole;
      const fallback =
        role === "normal"
          ? "default"
          : role === "normal_add"
            ? "copy"
            : role === "forbidden"
              ? "not-allowed"
              : role === "hand"
                ? "grab"
                : role === "scroll"
                  ? "grabbing"
                  : role === "magnifier"
                    ? "zoom-in"
                    : role.startsWith("move")
                      ? "move"
                      : role.startsWith("size_") || role.startsWith("skew_")
                        ? `${role.slice(5) === "we" ? "ew" : role.slice(5)}-resize`
                        : "crosshair";
      return [
        cursorVariable(role),
        native ? fallback : artworkCursor(role, resolvedScale, fallback),
      ];
    }),
  ) as CSSProperties;
}

export interface CursorProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Makes the package cursor variables available to a subtree without adding a layout box. */
export function CursorProvider({ children, className, ...props }: CursorProviderProps) {
  return (
    <div
      {...props}
      className={[styles.scope, styles.cursorScope, className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
