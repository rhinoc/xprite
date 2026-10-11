import type { Border } from "$/components/border";

export enum ListBoxMode {
  Single = "single",
  Multiple = "multiple",
  Navigation = "navigation",
}

export enum ListBoxBorderStyle {
  Single = "single",
  Inset = "inset",
  Thick = "thick",
}

export interface ListBoxPresentationProps {
  /** False removes the frame. True uses the skin's inset border; an object selects its style. */
  border?: Border<ListBoxBorderStyle>;
}
