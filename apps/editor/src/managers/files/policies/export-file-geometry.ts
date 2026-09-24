import type { FormLayout } from "$/managers/dialogs/form-layout";
/** Aseprite ExportFileWindow and GifOptions widget-dump geometry in scene units. */
export function exportFileAsepriteLayout(
  playSubtags: boolean,
  pixelRatio: boolean,
  playCount = false,
  webpMode = false,
): FormLayout {
  const extra = (Number(playSubtags) + Number(pixelRatio)) * 32;
  const playCountHeight = playCount ? 40 : 0;
  const webpModeHeight = webpMode ? 40 : 0;
  return {
    height: 382 + extra + playCountHeight + webpModeHeight,
    initialFocusAction: "Export",
    fields: {
      output: { x: 0, y: 0, width: 456, height: 30, labelWidth: 176, inset: 0 },
      format: { x: 0, y: 38, width: 456, height: 30, labelWidth: 176, inset: 0 },
      ...(webpMode
        ? { webpCompression: { x: 0, y: 78, width: 456, height: 30, labelWidth: 176, inset: 0 } }
        : {}),
      resize: { x: 0, y: 78 + webpModeHeight, width: 266, labelWidth: 176, inset: 0 },
      area: { x: 274, y: 78 + webpModeHeight, width: 182, labelWidth: 54, inset: 0 },
      layers: { x: 0, y: 118 + webpModeHeight, width: 456, labelWidth: 176, inset: 0 },
      frames: { x: 0, y: 158 + webpModeHeight, width: 456, labelWidth: 176, inset: 0 },
      ...(playCount
        ? {
            loopCount: {
              x: 0,
              y: 198 + webpModeHeight,
              width: 456,
              height: 30,
              labelWidth: 220,
              inset: 0,
            },
          }
        : {}),
      anidir: {
        x: 0,
        y: 198 + playCountHeight + webpModeHeight,
        width: 456,
        labelWidth: 176,
        inset: 0,
      },
      playSubtags: {
        x: 0,
        y: 238 + playCountHeight + webpModeHeight,
        width: 456,
        height: 24,
        inset: 0,
      },
      pixelRatio: {
        x: 0,
        y: 238 + (playSubtags ? 32 : 0) + playCountHeight + webpModeHeight,
        width: 456,
        height: 24,
        inset: 0,
      },
      forTwitter: {
        x: 0,
        y: 238 + extra + playCountHeight + webpModeHeight,
        width: 190,
        height: 24,
        inset: 0,
      },
      adjustResize: {
        x: 198,
        y: 238 + extra + playCountHeight + webpModeHeight,
        width: 258,
        height: 24,
        inset: 0,
      },
      ignoreEmpty: {
        x: 0,
        y: 270 + extra + playCountHeight + webpModeHeight,
        width: 456,
        height: 24,
        inset: 0,
      },
    },
    actions: {
      Export: { x: 208, y: 302 + extra + playCountHeight + webpModeHeight, width: 120, height: 34 },
      Cancel: { x: 336, y: 302 + extra + playCountHeight + webpModeHeight, width: 120, height: 34 },
    },
  };
}
export const gifOptionsAsepriteLayout: FormLayout = {
  height: 222,
  initialFocusAction: "OK",
  fields: {
    interlaced: { x: 0, y: 30, width: 524, height: 24, inset: 0 },
    loop: { x: 0, y: 62, width: 524, height: 24, inset: 0 },
    palette: { x: 0, y: 94, width: 524, height: 24, inset: 0 },
    dontShow: { x: 0, y: 142, width: 260, height: 34, inset: 0 },
  },
  separators: [
    { x: 0, y: 0, width: 524, height: 22, text: "General Options:" },
    { x: 0, y: 126, width: 524, height: 8 },
  ],
  actions: {
    OK: { x: 276, y: 142, width: 120, height: 34 },
    Cancel: { x: 404, y: 142, width: 120, height: 34 },
  },
};
