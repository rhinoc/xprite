import type { ScrollbarVariant } from "$/components/scrollbar/types";
import { miniScrollbarVariant } from "$/components/scrollbar/variants/mini";
import { regularScrollbarVariant } from "$/components/scrollbar/variants/regular";
import { transparentScrollbarVariant } from "$/components/scrollbar/variants/transparent";
import type { ScrollbarVariantStyle } from "$/components/scrollbar/variants/types";

export const scrollbarVariants = {
  mini: miniScrollbarVariant,
  regular: regularScrollbarVariant,
  transparent: transparentScrollbarVariant,
} satisfies Record<ScrollbarVariant, ScrollbarVariantStyle>;
