import { ScrollbarStyle } from "$/base/theme/theme-types";
import { miniScrollbarStyle } from "$/components/scrollbar/variants/mini";
import { regularScrollbarStyle } from "$/components/scrollbar/variants/regular";
import { transparentScrollbarStyle } from "$/components/scrollbar/variants/transparent";
import type { ScrollbarArtwork } from "$/components/scrollbar/variants/types";

export const scrollbarStyles = {
  [ScrollbarStyle.Compact]: miniScrollbarStyle,
  [ScrollbarStyle.Classic]: regularScrollbarStyle,
  [ScrollbarStyle.Transparent]: transparentScrollbarStyle,
} satisfies Record<ScrollbarStyle, ScrollbarArtwork>;
