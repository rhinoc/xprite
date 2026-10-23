import type { FormLayout } from "$/managers/dialogs/form-layout";
import type { SpriteSheetOptions } from "@xprite/editor-core/import-export";

export function spriteSheetLayout(
  tab: string,
  o: Pick<SpriteSheetOptions, "imageEnabled" | "dataEnabled">,
): FormLayout {
  const dataY = 40 + (o.imageEnabled ? 32 : 26) + 10,
    metaY = dataY + (o.dataEnabled ? 32 : 26) + 10;
  const outputFooterY = o.dataEnabled ? metaY + 138 : metaY + 18;
  const footerY =
    tab === "layout" ? 172 : tab === "sprite" ? 180 : tab === "borders" ? 174 : outputFooterY;
  const grow = tab === "output" && o.dataEnabled ? 2 : 0;
  const sharedFields = {
    openGenerated: { x: 10 + grow, y: footerY, width: 192, height: 38, inset: 0 },
    preview: { x: 210 + grow, y: footerY, width: 104, height: 38, inset: 0 },
  };
  const authoredFields: FormLayout["fields"] =
    tab === "layout"
      ? {
          layout: { x: 0, y: 40, width: 572, labelWidth: 116, inset: 0 },
          constraint: { x: 0, y: 82, width: 340, labelWidth: 116, inset: 0 },
          constraintWidth: { x: 348, y: 82, width: 104, labelWidth: 0, inset: 0 },
          constraintHeight: { x: 460, y: 82, width: 116, labelWidth: 0, inset: 0 },
          mergeDuplicates: { x: 116, y: 124, width: 180, height: 26, inset: 0 },
          ignoreEmpty: { x: 304, y: 124, width: 152, height: 26, inset: 0 },
          powerOfTwo: { x: 464, y: 124, width: 104, height: 26, inset: 0 },
        }
      : tab === "sprite"
        ? {
            source: { x: 0, y: 40, width: 428, labelWidth: 82, inset: 0 },
            layers: { x: 0, y: 82, width: 428, labelWidth: 82, inset: 0 },
            frames: { x: 0, y: 124, width: 428, labelWidth: 82, inset: 0 },
            splitLayers: { x: 436, y: 82, width: 138, height: 34, inset: 0 },
            splitTags: { x: 436, y: 124, width: 138, height: 34, inset: 0 },
          }
        : tab === "borders"
          ? {
              borderPadding: { x: 0, y: 40, width: 246, height: 32, labelWidth: 148, inset: 0 },
              shapePadding: { x: 0, y: 80, width: 246, height: 32, labelWidth: 148, inset: 0 },
              innerPadding: { x: 0, y: 120, width: 246, height: 32, labelWidth: 148, inset: 0 },
              trimSprite: { x: 272, y: 40, width: 136, height: 26, inset: 0 },
              trimCels: { x: 272, y: 74, width: 136, height: 26, inset: 0 },
              trimByGrid: { x: 272, y: 108, width: 136, height: 26, inset: 0 },
              extrude: { x: 434, y: 40, width: 106, height: 26, inset: 0 },
            }
          : {
              imageEnabled: { x: 0, y: 40, width: 130, height: o.imageEnabled ? 32 : 26, inset: 0 },
              name: { x: 138, y: 40, width: 436 + grow, height: 32, labelWidth: 0, inset: 0 },
              dataEnabled: {
                x: 0,
                y: dataY,
                width: 130,
                height: o.dataEnabled ? 32 : 26,
                inset: 0,
              },
              dataName: {
                x: 138,
                y: dataY,
                width: 436 + grow,
                height: 32,
                labelWidth: 0,
                inset: 0,
              },
              dataFormat: { x: 138, y: metaY, width: 104, labelWidth: 0, inset: 0 },
              metaLabel: { x: 250, y: metaY, width: 50, height: 34, inset: 0 },
              listLayers: { x: 308, y: metaY, width: 96, height: 34, inset: 0 },
              listTags: { x: 412, y: metaY, width: 80, height: 34, inset: 0 },
              listSlices: { x: 500, y: metaY, width: 86, height: 34, inset: 0 },
              filenameFormat: {
                x: 138,
                y: metaY + 42,
                width: 404,
                height: 32,
                labelWidth: 142,
                inset: 0,
              },
              filenameHelp: { x: 550, y: metaY + 42, width: 28, height: 32, inset: 0 },
              tagnameFormat: {
                x: 138,
                y: metaY + 82,
                width: 404,
                height: 32,
                labelWidth: 142,
                inset: 0,
              },
              tagnameHelp: { x: 550, y: metaY + 82, width: 28, height: 32, inset: 0 },
            };
  return {
    height: footerY + 86,
    tabs: { x: 148, y: 0, widths: [60, 58, 72, 64], height: 32 },
    fields: { ...authoredFields, ...sharedFields },
    separators: [
      { x: 0, y: 0, width: 140, height: 32 },
      { x: 408, y: 0, width: 140 + grow, height: 32 },
      { x: 0, y: footerY - 18, width: 572 + grow, height: 10 },
      ...(tab === "borders"
        ? [
            { x: 254, y: 40, width: 12, height: 112, vertical: true },
            { x: 416, y: 40, width: 12, height: 112, vertical: true },
          ]
        : []),
    ],
    actions: {
      Export: { x: 320 + grow, y: footerY, width: 124, height: 38 },
      Cancel: { x: 452 + grow, y: footerY, width: 124, height: 38 },
    },
  };
}

export function importSpriteSheetLayout(paddingEnabled: boolean): FormLayout {
  const extra = paddingEnabled ? 40 : 0;
  return {
    height: 398 + extra,
    originOffsetY: -20,
    initialFocusAction: "Import",
    fields: {
      layout: { x: 0, y: 44, width: 396, labelWidth: 96, inset: 0 },
      x: { x: 0, y: 116, width: 202, labelWidth: 96, inset: 0, height: 32 },
      y: { x: 210, y: 116, width: 186, labelWidth: 78, inset: 0, height: 32 },
      width: { x: 0, y: 156, width: 202, labelWidth: 96, inset: 0, height: 32 },
      height: { x: 210, y: 156, width: 186, labelWidth: 78, inset: 0, height: 32 },
      columns: { x: 0, y: 210, width: 202, labelWidth: 96, inset: 0, height: 32 },
      rows: { x: 210, y: 210, width: 186, labelWidth: 78, inset: 0, height: 32 },
      paddingEnabled: { x: 0, y: 250, width: 396, height: 26, inset: 0 },
      horizontalPadding: { x: 0, y: 284, width: 202, labelWidth: 96, inset: 0, height: 32 },
      verticalPadding: { x: 210, y: 284, width: 186, labelWidth: 78, inset: 0, height: 32 },
      partialTiles: { x: 0, y: 284 + extra, width: 396, height: 26, inset: 0 },
    },
    separators: [
      { x: 0, y: 86, width: 396, height: 24, text: "Tiles:" },
      { x: 0, y: 196, width: 396, height: 8 },
    ],
    actions: {
      "Select File": { x: 0, y: 0, width: 396, height: 36 },
      Import: { x: 144, y: 318 + extra, width: 124, height: 36 },
      Cancel: { x: 276, y: 318 + extra, width: 124, height: 36 },
    },
  };
}
