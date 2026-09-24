import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { CheckboxVariant } from "$/components/checkbox/types";

export interface CheckboxVariantStyle {
  role: CheckboxVariant;
  artworkPrefix: "check" | "radio";
  hotFace: UiColorRole;
  focusFace: UiColorRole;
  focusArtwork: "check_focus" | "radio_focus";
  nextValue: (current: boolean) => boolean;
}
