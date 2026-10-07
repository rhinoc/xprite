import { forwardRef, type Ref } from "react";

import { ButtonControl } from "$/components/button/ButtonControl";
import { ButtonLink } from "$/components/button/content/ButtonLink";
import {
  ButtonVariant,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonComponent,
  type ButtonTileProps,
  type ButtonTileLinkProps,
} from "$/components/button/types";
import { SplitButtonContent } from "$/components/button/variants/split/SplitButtonContent";
import { TileButton } from "$/components/button/variants/tile/TileButton";

export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps | ButtonLinkProps | ButtonTileProps | ButtonTileLinkProps
>(function Button(props, ref) {
  if (props.variant === ButtonVariant.Tile) return <TileButton {...props} ref={ref} />;
  if (props.href !== undefined)
    return <ButtonLink {...props} ref={ref as Ref<HTMLAnchorElement>} />;

  const { variant = ButtonVariant.Standard, menu, ...buttonProps } = props;
  const buttonRef = ref as Ref<HTMLButtonElement>;
  if (variant === ButtonVariant.Split)
    return <SplitButtonContent {...buttonProps} menu={menu} ref={buttonRef} />;

  return <ButtonControl {...buttonProps} variant={variant} ref={buttonRef} />;
}) as ButtonComponent;

Button.displayName = "Button";
