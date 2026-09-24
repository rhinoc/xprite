import { UINT8_MAX, type EditorSnapshot, type RasterEditor } from "@xprite/editor-core";

export interface PaletteTransparencyModel {
  indexedColorMode: boolean;
  transparentPaletteIndex: number;
  maxTransparentPaletteIndex: number;
  setTransparentPaletteIndex(index: number): boolean;
}

/** Transparent indices belong to the sprite and are limited by its eight-bit samples. */
export function getPaletteTransparencyModel(
  core: RasterEditor | null,
  snapshot: EditorSnapshot | null,
): PaletteTransparencyModel {
  const timeline = snapshot?.document?.timeline;
  return {
    indexedColorMode: timeline?.colorDepth === 8,
    transparentPaletteIndex:
      timeline?.transparentIndex ?? timeline?.asepriteSource?.header.transparentIndex ?? 0,
    maxTransparentPaletteIndex: Math.min(UINT8_MAX, (snapshot?.palette.length ?? 0) - 1),
    setTransparentPaletteIndex(index) {
      const current = core?.getSnapshot();
      if (
        !core ||
        current?.document?.timeline?.colorDepth !== 8 ||
        !Number.isInteger(index) ||
        index < 0 ||
        index > UINT8_MAX ||
        index >= current.palette.length
      )
        return false;
      const transparentIndex =
        current.document.timeline.transparentIndex ??
        current.document.timeline.asepriteSource?.header.transparentIndex ??
        0;
      if (index !== transparentIndex) core.sprite.setProperties({ transparentIndex: index });
      return true;
    },
  };
}
