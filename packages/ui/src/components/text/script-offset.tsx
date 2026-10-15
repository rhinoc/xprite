import { Fragment, type CSSProperties, type ReactNode } from "react";

import { useTheme } from "$/base/theme/theme-context";
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

/**
 * The offset style for the active theme, or undefined when its offset is 0 so themes that need no
 * correction render exactly as before (no extra positioning on the run).
 */
export function useCjkRunStyle(scale = 2): CSSProperties | undefined {
  const { definition } = useTheme();
  return definition.typography.cjkTextOffsetY ? cjkRunOffsetStyle(scale) : undefined;
}

/** Plain-string children with each CJK run shifted by the theme's CJK offset. */
export function ScriptText({ children, scale = 2 }: { children: ReactNode; scale?: number }) {
  const style = useCjkRunStyle(scale);
  if (typeof children !== "string") return <>{children}</>;
  return (
    <>
      {textRuns(children).map((run, index) =>
        run.cjk ? (
          <span key={index} data-script-run="" style={style}>
            {run.text}
          </span>
        ) : (
          <Fragment key={index}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}
