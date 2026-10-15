import { Fragment, type CSSProperties, type ReactNode } from "react";

import { textRuns } from "$/components/text/text-runs";

/**
 * Latin is the base script. The one theme-level CJK correction (`typography.cjkTextOffsetY`,
 * published as `--ui-cjk-text-offset-y`) is applied here and nowhere else: every component that
 * renders text routes its CJK runs through `cjkRunOffsetStyle` or `ScriptText`, so labels in
 * checkboxes, inputs, buttons, selects, tabs, menus and plain Text all share one value.
 */

/** Style for a CJK run: a relative shift that never changes layout. `scale` is the artwork scale. */
export function cjkRunOffsetStyle(scale = 2): CSSProperties {
  return {
    position: "relative",
    top: `calc(var(--ui-cjk-text-offset-y, 0px) * ${scale / 2})`,
  };
}

/** Plain-string children with each CJK run shifted by the theme's CJK offset. */
export function ScriptText({ children, scale = 2 }: { children: ReactNode; scale?: number }) {
  if (typeof children !== "string") return <>{children}</>;
  return (
    <>
      {textRuns(children).map((run, index) =>
        run.cjk ? (
          <span key={index} style={cjkRunOffsetStyle(scale)}>
            {run.text}
          </span>
        ) : (
          <Fragment key={index}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}
