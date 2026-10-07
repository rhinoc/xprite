import { forwardRef } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { ButtonContent } from "$/components/button/content/ButtonContent";
import { ButtonAppearance, ButtonVariant, type ButtonLinkProps } from "$/components/button/types";

import buttonStyles from "$/components/button/button.module.css";
import styles from "$/components/button/content/content.module.css";
import quietStyles from "$/components/button/content/quiet.module.css";

/** Native navigation semantics with the same standard skin and content slots as a button. */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  {
    href,
    variant = ButtonVariant.Standard,
    appearance = ButtonAppearance.Default,
    children,
    text,
    slots,
    disabled,
    selected,
    className,
    onClick,
    tabIndex,
    ...props
  },
  ref,
) {
  const quiet = appearance === ButtonAppearance.Quiet;
  const { translateSource } = useTheme();
  return (
    <a
      {...props}
      ref={ref}
      href={disabled ? undefined : href}
      tabIndex={disabled ? -1 : tabIndex}
      aria-disabled={disabled || undefined}
      className={cn(
        buttonStyles.root,
        quiet ? quietStyles.quiet : styles.surfaceFrame,
        !quiet && styles.surface,
        className,
      )}
      data-slot="button"
      data-variant={variant}
      data-appearance={appearance}
      data-content-slots="true"
      data-selected={selected || undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      <ButtonContent slots={slots}>
        {children ?? (text ? translateSource(text) : null)}
      </ButtonContent>
    </a>
  );
});
