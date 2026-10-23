import type { FormLayout } from "$/managers/dialogs/form-layout";

export function exportFileLayout(
  playSubtags: boolean,
  pixelRatio: boolean,
  playCount = false,
  webpMode = false,
  includeFormat = true,
): FormLayout {
  const extra = (Number(playSubtags) + Number(pixelRatio)) * 34;
  const playCountHeight = playCount ? 42 : 0;
  const webpModeHeight = webpMode ? 42 : 0;
  const layout: FormLayout = {
    height: 394 + extra + playCountHeight + webpModeHeight,
    initialFocusAction: "Export",
    fields: {
      output: { x: 0, y: 0, width: 468, height: 32, labelWidth: 184, inset: 0 },
      format: { x: 0, y: 40, width: 468, height: 32, labelWidth: 184, inset: 0 },
      ...(webpMode
        ? { webpCompression: { x: 0, y: 80, width: 468, height: 32, labelWidth: 184, inset: 0 } }
        : {}),
      resize: { x: 0, y: 80 + webpModeHeight, width: 274, labelWidth: 184, inset: 0 },
      area: { x: 282, y: 80 + webpModeHeight, width: 186, labelWidth: 56, inset: 0 },
      layers: { x: 0, y: 122 + webpModeHeight, width: 468, labelWidth: 184, inset: 0 },
      frames: { x: 0, y: 164 + webpModeHeight, width: 468, labelWidth: 184, inset: 0 },
      ...(playCount
        ? {
            loopCount: {
              x: 0,
              y: 206 + webpModeHeight,
              width: 468,
              height: 32,
              labelWidth: 228,
              inset: 0,
            },
          }
        : {}),
      anidir: {
        x: 0,
        y: 206 + playCountHeight + webpModeHeight,
        width: 468,
        labelWidth: 184,
        inset: 0,
      },
      playSubtags: {
        x: 0,
        y: 248 + playCountHeight + webpModeHeight,
        width: 468,
        height: 26,
        inset: 0,
      },
      pixelRatio: {
        x: 0,
        y: 248 + (playSubtags ? 34 : 0) + playCountHeight + webpModeHeight,
        width: 468,
        height: 26,
        inset: 0,
      },
      forTwitter: {
        x: 0,
        y: 248 + extra + playCountHeight + webpModeHeight,
        width: 196,
        height: 26,
        inset: 0,
      },
      adjustResize: {
        x: 204,
        y: 248 + extra + playCountHeight + webpModeHeight,
        width: 264,
        height: 26,
        inset: 0,
      },
      ignoreEmpty: {
        x: 0,
        y: 282 + extra + playCountHeight + webpModeHeight,
        width: 468,
        height: 26,
        inset: 0,
      },
    },
    actions: {
      Export: { x: 216, y: 316 + extra + playCountHeight + webpModeHeight, width: 124, height: 36 },
      Cancel: { x: 348, y: 316 + extra + playCountHeight + webpModeHeight, width: 124, height: 36 },
    },
  };
  if (!includeFormat) {
    const formatRowHeight = 42;
    const fields = Object.fromEntries(
      Object.entries(layout.fields).filter(([key]) => key !== "format"),
    );
    return {
      ...layout,
      height: layout.height! - formatRowHeight,
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          key,
          key === "output" ? field : { ...field, y: field.y - formatRowHeight },
        ]),
      ),
      actions: Object.fromEntries(
        Object.entries(layout.actions!).map(([key, action]) => [
          key,
          { ...action, y: action.y - formatRowHeight },
        ]),
      ),
    };
  }
  return layout;
}

export const gifOptionsLayout: FormLayout = {
  height: 232,
  initialFocusAction: "OK",
  fields: {
    interlaced: { x: 0, y: 32, width: 536, height: 26, inset: 0 },
    loop: { x: 0, y: 66, width: 536, height: 26, inset: 0 },
    palette: { x: 0, y: 100, width: 536, height: 26, inset: 0 },
    dontShow: { x: 0, y: 150, width: 268, height: 36, inset: 0 },
  },
  separators: [
    { x: 0, y: 0, width: 536, height: 24, text: "General Options:" },
    { x: 0, y: 134, width: 536, height: 8 },
  ],
  actions: {
    OK: { x: 284, y: 150, width: 124, height: 36 },
    Cancel: { x: 416, y: 150, width: 124, height: 36 },
  },
};

