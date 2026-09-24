import { forwardRef } from "react";

import { ButtonControl } from "$/components/button/ButtonControl";
import { ButtonVariant, type ButtonProps } from "$/components/button/types";
import { SplitButtonContent } from "$/components/button/variants/split/SplitButtonContent";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = ButtonVariant.Standard, menu, ...props },
  ref,
) {
  if (variant === ButtonVariant.Split)
    return <SplitButtonContent {...props} menu={menu} ref={ref} />;

  return <ButtonControl {...props} variant={variant} ref={ref} />;
});

Button.displayName = "Button";
