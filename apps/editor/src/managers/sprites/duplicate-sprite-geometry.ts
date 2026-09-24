import type { FormLayout } from "$/managers/dialogs/form-layout";

/** Geometry transcribed from data/widgets/duplicate_sprite.xml. */
export const duplicateSpriteAsepriteLayout: FormLayout = {
  height: 164,
  initialFocusAction: "OK",
  fields: {
    duplicate: { x: 8, y: 8, width: 90, height: 24, inset: 0 },
    source: { x: 102, y: 8, width: 280, height: 24, inset: 0 },
    as: { x: 8, y: 40, width: 90, height: 30, inset: 0 },
    destination: { x: 102, y: 40, width: 280, labelWidth: 0, height: 30, inset: 0 },
    flatten: { x: 8, y: 78, width: 374, height: 24, inset: 0 },
  },
  actions: {
    OK: { x: 214, y: 116, width: 80, height: 32 },
    Cancel: { x: 302, y: 116, width: 80, height: 32 },
  },
};
