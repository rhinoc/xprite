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
  const baseHeight = includeFormat ? 506 : 466;
  return {
    height: baseHeight + extra + playCountHeight + webpModeHeight,
    initialFocusAction: "Export",
    fields: {},
    actions: {},
  };
}

export const gifOptionsLayout: FormLayout = {
  height: 222,
  initialFocusAction: "OK",
  fields: {},
  separators: [{ x: 0, y: 0, width: 0, height: 0, text: "General Options:" }],
  actions: {},
};
