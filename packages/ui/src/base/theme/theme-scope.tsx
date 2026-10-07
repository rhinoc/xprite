import { useContext, type CSSProperties, type HTMLAttributes } from "react";

import { ThemeContext } from "$/base/theme/theme-context-instance";

/** A layout-neutral scope. Portals create another scope with the same React theme context. */
export function ThemeScope({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeScope must be used inside UIProvider");
  const { uiTheme, variant, tokens } = context;
  return (
    <div
      {...props}
      data-ui-theme={uiTheme.id}
      data-ui-appearance={variant}
      style={
        { display: "contents", color: "var(--xse-text)", ...tokens, ...style } as CSSProperties
      }
    />
  );
}
