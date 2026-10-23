import type { FormLayout } from "$/managers/dialogs/form-layout";

export const duplicateSpriteLayout: FormLayout = {
  height: 172,
  initialFocusAction: "OK",
  fields: {
    duplicate: { x: 12, y: 12, width: 96, height: 24, inset: 0 },
    source: { x: 116, y: 12, width: 272, height: 24, inset: 0 },
    as: { x: 12, y: 48, width: 96, height: 30, inset: 0 },
    destination: { x: 116, y: 48, width: 272, labelWidth: 0, height: 30, inset: 0 },
    flatten: { x: 12, y: 90, width: 376, height: 24, inset: 0 },
  },
  actions: {
    OK: { x: 220, y: 124, width: 84, height: 32 },
    Cancel: { x: 312, y: 124, width: 84, height: 32 },
  },
};
