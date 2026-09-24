import { CheckboxVariant } from "$/components/checkbox/types";
import type { CheckboxVariantStyle } from "$/components/checkbox/variants/types";

export const radioVariantStyle: CheckboxVariantStyle = {
  role: CheckboxVariant.Radio,
  artworkPrefix: "radio",
  hotFace: "radio_hot_face",
  focusFace: "radio_focus_face",
  focusArtwork: "radio_focus",
  nextValue: () => true,
};
