import { PopupVariant } from "$/components/window/variants/popup";
import type { PopupVariantContext, PopupVariantProps } from "$/components/window/variants/popup";

export type PopoverContext = PopupVariantContext;
export type PopoverProps = PopupVariantProps;

/** Theme-skinned popup with focus restoration and outside dismissal. */
export function Popover(props: PopoverProps) {
  return <PopupVariant {...props} />;
}
