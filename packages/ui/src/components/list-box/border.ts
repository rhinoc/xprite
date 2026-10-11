import { borderStyle } from "$/components/border";
import { ListBoxBorderStyle, type ListBoxPresentationProps } from "$/components/list-box/types";

/** Resolve the optional border independently of the list's selection or navigation mode. */
export function listBoxBorderStyle(
  border: ListBoxPresentationProps["border"] = true,
): ListBoxBorderStyle | undefined {
  return borderStyle(border, ListBoxBorderStyle.Inset);
}
