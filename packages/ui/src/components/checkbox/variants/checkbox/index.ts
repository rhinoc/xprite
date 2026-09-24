import { CheckboxVariant } from "$/components/checkbox/types";
import type { CheckboxVariantStyle } from "$/components/checkbox/variants/types";

export const checkboxVariantStyle: CheckboxVariantStyle = {
  role: CheckboxVariant.Checkbox,
  artworkPrefix: "check",
  hotFace: "check_hot_face",
  focusFace: "check_focus_face",
  focusArtwork: "check_focus",
  nextValue: (current) => !current,
};
