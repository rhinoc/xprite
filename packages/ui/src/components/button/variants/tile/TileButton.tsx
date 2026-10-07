import { forwardRef, type Ref } from "react";

import {
  ButtonTileSize,
  type ButtonTileProps,
  type ButtonTileLinkProps,
} from "$/components/button/types";

import "$/components/button/variants/tile/tile.module.css";

/** Icon and caption composition with native button or link activation. */
export const TileButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonTileProps | ButtonTileLinkProps
>(function TileButton(
  {
    variant: _variant,
    tileSize = ButtonTileSize.Regular,
    compactOnSmallScreens = false,
    text,
    slots,
    children,
    ...props
  },
  ref,
) {
  const content = (
    <>
      <span data-slot="desktop-icon-artwork" aria-hidden="true">
        {slots?.leading}
      </span>
      <span data-slot="desktop-icon-label">{slots?.content ?? children ?? text}</span>
      {slots?.trailing}
    </>
  );
  const attributes = {
    "data-ui-desktop-icon": "",
    "data-size": tileSize,
    "data-compact-on-small-screens": compactOnSmallScreens || undefined,
  };
  if (props.href !== undefined) {
    const { disabled, onClick, tabIndex, ...link } = props;
    return (
      <a
        {...link}
        {...attributes}
        ref={ref as Ref<HTMLAnchorElement>}
        href={disabled ? undefined : link.href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : tabIndex}
        onClick={(event) => {
          if (disabled) event.preventDefault();
          else onClick?.(event);
        }}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" {...props} {...attributes} ref={ref as Ref<HTMLButtonElement>}>
      {content}
    </button>
  );
});
