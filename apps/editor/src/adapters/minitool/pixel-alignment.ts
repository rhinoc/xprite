import type { CSSProperties } from "react";

/** Inline styles are not lowered by the CSS compiler. Use the Chrome 61 transform syntax. */
export function miniToolScrollAreaAlignment(
  offset: { x: number; y: number },
  style?: CSSProperties,
): Pick<CSSProperties, "translate" | "transform"> {
  // An explicit caller translation opts out of automatic alignment in ScrollArea.
  if (style?.translate !== undefined) return { translate: style.translate };
  const inherited = style?.transform;
  return {
    translate: undefined,
    transform: `translate(${offset.x}px, ${offset.y}px)${
      inherited && inherited !== "none" ? ` ${inherited}` : ""
    }`,
  };
}
