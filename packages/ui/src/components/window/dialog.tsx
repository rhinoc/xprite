import { WindowVariant } from "$/components/window/variants/window";
import type { WindowVariantContext, WindowVariantProps } from "$/components/window/variants/window";

export type DialogContext = WindowVariantContext;
export type DialogProps = WindowVariantProps;

/** Movable, resizable themed dialog window. */
export function Dialog(props: DialogProps) {
  return <WindowVariant {...props} />;
}
