import type { UiColorRole } from "$/base/theme/theme-name-types";

export interface CheckboxStyle {
  artworkPrefix: "check" | "radio";
  hotFace: UiColorRole;
  focusFace: UiColorRole;
  focusArtwork: "check_focus" | "radio_focus";
}
