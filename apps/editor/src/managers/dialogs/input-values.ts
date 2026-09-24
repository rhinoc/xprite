import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { PreferenceStoragePort } from "$/managers/ports/platform";
import { evaluateSizeExpression, parseSpriteDimension } from "@xprite/editor-core";
import { CanvasAnchor, type SpriteResizeMethod } from "@xprite/editor-core";
import { PixelResizeMethod } from "@xprite/editor-core";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "@xprite/editor-core";

export interface DialogRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DialogPan {
  x: number;
  y: number;
}

export interface DialogViewTransform {
  zoom: number;
  pan: DialogPan;
}

export const DialogCanvasAnchor = Object.freeze({
  TopLeft: CanvasAnchor.TopLeft,
  Top: CanvasAnchor.Top,
  TopRight: CanvasAnchor.TopRight,
  Left: CanvasAnchor.Left,
  Center: CanvasAnchor.Center,
  Right: CanvasAnchor.Right,
  BottomLeft: CanvasAnchor.BottomLeft,
  Bottom: CanvasAnchor.Bottom,
  BottomRight: CanvasAnchor.BottomRight,
});
export type DialogCanvasAnchor = (typeof DialogCanvasAnchor)[keyof typeof DialogCanvasAnchor];

export const DialogSpriteResizeMethod = Object.freeze({
  Nearest: PixelResizeMethod.Nearest,
  Bilinear: PixelResizeMethod.Bilinear,
  RotSprite: PixelResizeMethod.RotSprite,
});
export type DialogSpriteResizeMethod = SpriteResizeMethod;

export const DIALOG_IMAGE_DIMENSION_MAX = MAX_IMAGE_DIMENSION;
const DIALOG_IMAGE_PIXEL_MAX = MAX_IMAGE_PIXELS;

export function evaluateDialogNumber(value: string): number | null {
  return evaluateSizeExpression(value);
}

export function parseNewSpriteDimension(value: string): number | null {
  return parseSpriteDimension(value);
}

export function validDialogImageSize(width: number, height: number): boolean {
  const clamp = (value: number) =>
    Math.max(1, Math.min(DIALOG_IMAGE_DIMENSION_MAX, Math.trunc(value)));
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    clamp(width) * clamp(height) <= DIALOG_IMAGE_PIXEL_MAX
  );
}

export interface NewSpriteChoices {
  colorDepth: 8 | 16 | 32;
  background: "transparent" | "white" | "black";
}

const NEW_SPRITE_CHOICES_KEY = "xse.dialog.new-sprite-choices.v1";
const SIZE_DIALOG_PREFERENCES_KEY = "xse.dialog.document-size-options.v1";

export function useDialogInputPreferences() {
  const storage = useEditorPlatformPorts()?.preferences ?? null;
  return {
    readNewSpriteChoices: () => readNewSpriteChoices(storage),
    writeNewSpriteChoices: (value: NewSpriteChoices) => writeNewSpriteChoices(value, storage),
    readDocumentSizePreferences: () => readDocumentSizePreferences(storage),
    writeDocumentSizePreferences: (value: DocumentSizePreferences) =>
      writeDocumentSizePreferences(value, storage),
  };
}

function readNewSpriteChoices(storage: PreferenceStoragePort | null): NewSpriteChoices {
  try {
    const saved = JSON.parse(storage?.getItem(NEW_SPRITE_CHOICES_KEY) ?? "null");
    return {
      colorDepth: saved?.colorDepth === 8 || saved?.colorDepth === 16 ? saved.colorDepth : 32,
      background:
        saved?.background === "white" || saved?.background === "black"
          ? saved.background
          : "transparent",
    };
  } catch {
    return { colorDepth: 32, background: "transparent" };
  }
}

function writeNewSpriteChoices(
  value: NewSpriteChoices,
  storage: PreferenceStoragePort | null,
): void {
  try {
    storage?.setItem(NEW_SPRITE_CHOICES_KEY, JSON.stringify(value));
  } catch {
    // The current dialog selection remains usable when browser storage is unavailable.
  }
}

export interface DocumentSizePreferences {
  lockRatio: boolean;
  method: DialogSpriteResizeMethod;
  trim: boolean;
}

const DEFAULT_SIZE_PREFERENCES: DocumentSizePreferences = {
  lockRatio: false,
  method: DialogSpriteResizeMethod.Nearest,
  trim: false,
};

function readDocumentSizePreferences(
  storage: PreferenceStoragePort | null,
): DocumentSizePreferences {
  try {
    const saved = JSON.parse(storage?.getItem(SIZE_DIALOG_PREFERENCES_KEY) ?? "{}");
    const supportedMethod = [
      DialogSpriteResizeMethod.Nearest,
      DialogSpriteResizeMethod.Bilinear,
      DialogSpriteResizeMethod.RotSprite,
    ].includes(saved.method);
    return {
      lockRatio: saved.lockRatio === true,
      method: supportedMethod ? saved.method : DialogSpriteResizeMethod.Nearest,
      trim: saved.trim === true,
    };
  } catch {
    return DEFAULT_SIZE_PREFERENCES;
  }
}

function writeDocumentSizePreferences(
  value: DocumentSizePreferences,
  storage: PreferenceStoragePort | null,
): void {
  try {
    storage?.setItem(SIZE_DIALOG_PREFERENCES_KEY, JSON.stringify(value));
  } catch {
    // Resizing works when browser storage is unavailable.
  }
}
