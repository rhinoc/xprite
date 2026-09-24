import type { ScrollbarVariant } from "$/components/scrollbar/types";

export interface ScrollbarVariantStyle {
  variant: ScrollbarVariant;
  artworkPrefix: "mini_scrollbar" | "scrollbar" | "transparent_scrollbar";
  hoverArtwork: boolean;
}
