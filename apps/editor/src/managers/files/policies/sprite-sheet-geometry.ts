import type { FormLayout } from "$/managers/dialogs/form-layout";
import type { SpriteSheetOptions } from "@xprite/editor-core/import-export";
/** Geometry transcribed from unmodified Aseprite widget dumps; units are the
 * shared Aseprite scene's 2× source-pixel coordinates. */
export function spriteSheetAsepriteLayout(
  tab: string,
  o: Pick<SpriteSheetOptions, "imageEnabled" | "dataEnabled">,
): FormLayout {
  const dataY = 38 + (o.imageEnabled ? 30 : 24) + 8,
    metaY = dataY + (o.dataEnabled ? 30 : 24) + 8;
  const outputFooterY = o.dataEnabled ? metaY + 132 : metaY + 16;
  const footerY =
    tab === "layout" ? 166 : tab === "sprite" ? 174 : tab === "borders" ? 168 : outputFooterY;
  const grow = tab === "output" && o.dataEnabled ? 2 : 0;
  const sharedFields = {
    openGenerated: { x: 8 + grow, y: footerY, width: 188, height: 36, inset: 0 },
    preview: { x: 204 + grow, y: footerY, width: 100, height: 36, inset: 0 },
  };
  const authoredFields: FormLayout["fields"] =
    tab === "layout"
      ? {
          layout: { x: 0, y: 38, width: 560, labelWidth: 112, inset: 0 },
          constraint: { x: 0, y: 78, width: 332, labelWidth: 112, inset: 0 },
          constraintWidth: { x: 340, y: 78, width: 100, labelWidth: 0, inset: 0 },
          constraintHeight: { x: 448, y: 78, width: 112, labelWidth: 0, inset: 0 },
          mergeDuplicates: { x: 112, y: 118, width: 176, height: 24, inset: 0 },
          ignoreEmpty: { x: 296, y: 118, width: 148, height: 24, inset: 0 },
          powerOfTwo: { x: 452, y: 118, width: 100, height: 24, inset: 0 },
        }
      : tab === "sprite"
        ? {
            source: { x: 0, y: 38, width: 418, labelWidth: 78, inset: 0 },
            layers: { x: 0, y: 78, width: 418, labelWidth: 78, inset: 0 },
            frames: { x: 0, y: 118, width: 418, labelWidth: 78, inset: 0 },
            splitLayers: { x: 426, y: 78, width: 134, height: 32, inset: 0 },
            splitTags: { x: 426, y: 118, width: 134, height: 32, inset: 0 },
          }
        : tab === "borders"
          ? {
              borderPadding: { x: 0, y: 38, width: 240, height: 30, labelWidth: 144, inset: 0 },
              shapePadding: { x: 0, y: 76, width: 240, height: 30, labelWidth: 144, inset: 0 },
              innerPadding: { x: 0, y: 114, width: 240, height: 30, labelWidth: 144, inset: 0 },
              trimSprite: { x: 266, y: 38, width: 132, height: 24, inset: 0 },
              trimCels: { x: 266, y: 70, width: 132, height: 24, inset: 0 },
              trimByGrid: { x: 266, y: 102, width: 132, height: 24, inset: 0 },
              extrude: { x: 424, y: 38, width: 102, height: 24, inset: 0 },
            }
          : {
              imageEnabled: { x: 0, y: 38, width: 126, height: o.imageEnabled ? 30 : 24, inset: 0 },
              name: { x: 134, y: 38, width: 426 + grow, height: 30, labelWidth: 0, inset: 0 },
              dataEnabled: {
                x: 0,
                y: dataY,
                width: 126,
                height: o.dataEnabled ? 30 : 24,
                inset: 0,
              },
              dataName: {
                x: 134,
                y: dataY,
                width: 426 + grow,
                height: 30,
                labelWidth: 0,
                inset: 0,
              },
              dataFormat: { x: 134, y: metaY, width: 100, labelWidth: 0, inset: 0 },
              metaLabel: { x: 242, y: metaY, width: 46, height: 32, inset: 0 },
              listLayers: { x: 296, y: metaY, width: 92, height: 32, inset: 0 },
              listTags: { x: 396, y: metaY, width: 76, height: 32, inset: 0 },
              listSlices: { x: 480, y: metaY, width: 82, height: 32, inset: 0 },
              filenameFormat: {
                x: 134,
                y: metaY + 40,
                width: 394,
                height: 30,
                labelWidth: 138,
                inset: 0,
              },
              filenameHelp: { x: 536, y: metaY + 40, width: 26, height: 30, inset: 0 },
              tagnameFormat: {
                x: 134,
                y: metaY + 78,
                width: 394,
                height: 30,
                labelWidth: 138,
                inset: 0,
              },
              tagnameHelp: { x: 536, y: metaY + 78, width: 26, height: 30, inset: 0 },
            };
  return {
    height: footerY + 82,
    tabs: { x: 144, y: 0, widths: [58, 56, 70, 62], height: 30 },
    fields: { ...authoredFields, ...sharedFields },
    separators: [
      { x: 0, y: 0, width: 136, height: 30 },
      { x: 398, y: 0, width: 136 + grow, height: 30 },
      { x: 0, y: footerY - 16, width: 560 + grow, height: 8 },
      ...(tab === "borders"
        ? [
            { x: 248, y: 38, width: 10, height: 106, vertical: true },
            { x: 406, y: 38, width: 10, height: 106, vertical: true },
          ]
        : []),
    ],
    actions: {
      Export: { x: 312 + grow, y: footerY, width: 120, height: 36 },
      Cancel: { x: 440 + grow, y: footerY, width: 120, height: 36 },
    },
  };
}

export function importSpriteSheetAsepriteLayout(paddingEnabled: boolean): FormLayout {
  const extra = paddingEnabled ? 38 : 0;
  return {
    height: 386 + extra,
    originOffsetY: -20,
    initialFocusAction: "Import",
    fields: {
      layout: { x: 0, y: 42, width: 386, labelWidth: 92, inset: 0 },
      x: { x: 0, y: 112, width: 196, labelWidth: 92, inset: 0, height: 30 },
      y: { x: 204, y: 112, width: 182, labelWidth: 74, inset: 0, height: 30 },
      width: { x: 0, y: 150, width: 196, labelWidth: 92, inset: 0, height: 30 },
      height: { x: 204, y: 150, width: 182, labelWidth: 74, inset: 0, height: 30 },
      columns: { x: 0, y: 204, width: 196, labelWidth: 92, inset: 0, height: 30 },
      rows: { x: 204, y: 204, width: 182, labelWidth: 74, inset: 0, height: 30 },
      paddingEnabled: { x: 0, y: 242, width: 386, height: 24, inset: 0 },
      horizontalPadding: { x: 0, y: 274, width: 196, labelWidth: 92, inset: 0, height: 30 },
      verticalPadding: { x: 204, y: 274, width: 182, labelWidth: 74, inset: 0, height: 30 },
      partialTiles: { x: 0, y: 274 + extra, width: 386, height: 24, inset: 0 },
    },
    separators: [
      { x: 0, y: 82, width: 386, height: 22, text: "Tiles:" },
      { x: 0, y: 188, width: 386, height: 8 },
    ],
    actions: {
      "Select File": { x: 0, y: 0, width: 386, height: 34 },
      Import: { x: 138, y: 306 + extra, width: 120, height: 34 },
      Cancel: { x: 266, y: 306 + extra, width: 120, height: 34 },
    },
  };
}
