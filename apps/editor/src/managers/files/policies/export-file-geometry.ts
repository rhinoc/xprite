import type { FormLayout } from "$/managers/dialogs/form-layout";

export function exportFileLayout(
  playSubtags: boolean,
  pixelRatio: boolean,
  playCount = false,
  webpMode = false,
  includeFormat = true,
): FormLayout {
  const extra = (Number(playSubtags) + Number(pixelRatio)) * 44;
  const playCountHeight = playCount ? 44 : 0;
  const webpModeHeight = webpMode ? 44 : 0;
  const baseHeight = includeFormat ? 538 : 498;
  return {
    height: baseHeight + extra + playCountHeight + webpModeHeight,
    initialFocusAction: "Export",
    fields: {},
    actions: {},
  };
}

export const gifOptionsLayout: FormLayout = {
  height: 254,
  initialFocusAction: "OK",
  fields: {},
  actions: {},
};
