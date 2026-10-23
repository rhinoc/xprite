import type { FormLayout } from "$/managers/dialogs/form-layout";
import type { SpriteSheetOptions } from "@xprite/editor-core/import-export";

export function spriteSheetLayout(
  _tab: string,
  _o: Pick<SpriteSheetOptions, "imageEnabled" | "dataEnabled">,
): FormLayout {
  return {
    fields: {},
    separators: [{ x: 0, y: -1, width: 560, height: 8, text: "" }],
    actions: {},
  };
}

export function importSpriteSheetLayout(_paddingEnabled: boolean): FormLayout {
  return {
    initialFocusAction: "Import",
    fields: {},
    actions: {},
  };
}
