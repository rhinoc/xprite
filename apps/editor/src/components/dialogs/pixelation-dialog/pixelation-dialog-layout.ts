import { FIELD_ROW_HEIGHT } from "@xprite/ui/canvas";

/** Same shell as New Sprite: a small window, section dividers, button set, OK / Cancel. */
export const DIALOG_WIDTH = 380;
export const DIALOG_MIN_WIDTH = 280;
export const DIALOG_HEIGHT = 560;
/** Matches FormDialog / PreferencesDialog window chrome (titlebar + bottom border). */
export const DIALOG_CHROME_HEIGHT = 46;
export const VIEWPORT_VERTICAL_MARGIN = 32;
const VIEWPORT_MIN_VERTICAL_MARGIN = 16;
const PREVIEW_MIN = 72;
const PREVIEW_MAX = 280;
const PREVIEW_EXPANDED_MAX = 220;
const PREVIEW_SHARE = 0.52;
const PREVIEW_EXPANDED_SHARE = 0.34;
export const FRAME_STEPPER_HEIGHT = 24;
const PARAMETER_MIN_HEIGHT = 64;
export const GAP = 8;
export const SECTION_HEIGHT = 22;
export const SECTION_GAP = 4;
export const OPTION_HEIGHT = 34;
export const HINT_HEIGHT = 58;
export const ROW_HEIGHT = 24;
/** At least the label font's height: the shared Text centres its glyphs and clips what overflows the box. */
export const FIELD_LABEL_HEIGHT = 18;
export const FOOTER_HEIGHT = 34;
export const FOOTER_STACK_HEIGHT = ROW_HEIGHT + GAP + FOOTER_HEIGHT;

export interface PixelationParameterFlags {
  hasMessage: boolean;
  showAdvanced: boolean;
  showGridSource: boolean;
  showDither: boolean;
  removeBgEnabled: boolean;
  removeBgManual: boolean;
}

export interface PixelationDialogHeightInput extends PixelationParameterFlags {
  availableHeight: number;
  hasMultiFrame: boolean;
}

export function computePixelationParameterHeight({
  hasMessage,
  showAdvanced,
  showGridSource,
  showDither,
  removeBgEnabled,
  removeBgManual,
}: PixelationParameterFlags): number {
  let height = SECTION_HEIGHT + SECTION_GAP + OPTION_HEIGHT + GAP;
  if (hasMessage) height += HINT_HEIGHT + GAP;
  height += ROW_HEIGHT + GAP; // Advanced toggle row
  if (showAdvanced) {
    // Algorithm, Size (Width x Height), Color Picker, Outline Prepass
    height += (FIELD_LABEL_HEIGHT + FIELD_ROW_HEIGHT + GAP) * 4;
    if (showGridSource) height += FIELD_LABEL_HEIGHT + FIELD_ROW_HEIGHT + GAP;
    height += ROW_HEIGHT + GAP; // Limit colors
    if (showDither) height += FIELD_LABEL_HEIGHT + FIELD_ROW_HEIGHT + GAP;
    height += ROW_HEIGHT + GAP; // Remove noise
  }
  height += ROW_HEIGHT + GAP; // Remove background toggle
  if (removeBgEnabled) {
    height += (ROW_HEIGHT + GAP) * 2; // Mode + Tolerance
    if (removeBgManual) height += ROW_HEIGHT + GAP; // Pick color button
  }
  return height;
}

export function computePixelationDialogHeight(input: PixelationDialogHeightInput): number {
  const frameStepperSpace = input.hasMultiFrame ? FRAME_STEPPER_HEIGHT + GAP : 0;
  const baseHeight = DIALOG_HEIGHT + frameStepperSpace;
  const maxHeight =
    input.availableHeight > VIEWPORT_VERTICAL_MARGIN
      ? input.availableHeight - VIEWPORT_VERTICAL_MARGIN
      : Math.max(1, input.availableHeight - VIEWPORT_MIN_VERTICAL_MARGIN);
  if (!input.showAdvanced && !input.removeBgEnabled && !input.hasMessage) {
    return Math.min(baseHeight, maxHeight);
  }
  const parameterContentHeight = computePixelationParameterHeight(input);
  const preferredPreview = input.showAdvanced ? PREVIEW_EXPANDED_MAX : PREVIEW_MAX;
  const neededHeight =
    DIALOG_CHROME_HEIGHT +
    preferredPreview +
    frameStepperSpace +
    GAP +
    parameterContentHeight +
    GAP +
    FOOTER_STACK_HEIGHT;
  return Math.min(Math.max(baseHeight, neededHeight), maxHeight);
}

export function computePixelationPreviewHeight(
  clientHeight: number,
  { showAdvanced, hasMultiFrame }: { showAdvanced: boolean; hasMultiFrame: boolean },
): number {
  const frameStepperSpace = hasMultiFrame ? FRAME_STEPPER_HEIGHT + GAP : 0;
  const maxPreview = showAdvanced ? PREVIEW_EXPANDED_MAX : PREVIEW_MAX;
  const share = showAdvanced ? PREVIEW_EXPANDED_SHARE : PREVIEW_SHARE;
  return Math.max(
    PREVIEW_MIN,
    Math.min(
      maxPreview,
      Math.round(clientHeight * share),
      clientHeight - FOOTER_STACK_HEIGHT - PARAMETER_MIN_HEIGHT - frameStepperSpace - GAP * 2,
    ),
  );
}
