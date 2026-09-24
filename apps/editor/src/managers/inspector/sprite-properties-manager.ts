import { useDialogEditorSource } from "$/managers/dialogs/internal-editor-source";
import type { AsepriteUserData } from "$/managers/user-data/user-data-manager";
import { rgbaToHex, UINT8_MAX } from "@xprite/editor-core";
import type { SpriteProperties } from "@xprite/editor-core";

interface InspectorColorProfileView {
  type: "none" | "srgb";
  gamma?: number;
}

interface InspectorIccProfileView {
  type: "icc";
  gamma?: number;
  data: Uint8Array;
}

export type InspectorColorProfile = InspectorColorProfileView | InspectorIccProfileView;

export interface SpritePropertiesEditView {
  pixelRatio?: readonly [number, number];
  useLayerUuids?: boolean;
  userData?: AsepriteUserData;
  transparentIndex?: number;
  colorProfile?: InspectorColorProfile | null;
  convertColorProfile?: boolean;
}

interface SpritePropertiesView {
  documentKey: number | string;
  name: string;
  width: number;
  height: number;
  depth: 8 | 16 | 32;
  frameCount: number;
  paletteLength: number;
  pixelRatio: readonly [number, number];
  transparentIndex: number;
  useLayerUuids: boolean;
  userData?: AsepriteUserData;
  colorProfile?: InspectorColorProfile;
  byteCount: number;
}

function spriteByteCount(
  document: NonNullable<ReturnType<typeof useDialogEditorSource>["document"]>,
) {
  const timeline = document.timeline;
  if (!timeline) return document.width * document.height * 4;
  const seen = new Set<object>();
  let bytes = 0;
  for (const frame of timeline.frames)
    for (const cel of frame.cels) {
      const image = cel?.asepriteSamples ?? cel?.pixels;
      if (!image || seen.has(image)) continue;
      seen.add(image);
      bytes += cel?.asepriteSamples?.data.byteLength ?? cel!.pixels.width * cel!.pixels.height * 4;
    }
  for (const set of timeline.tilesets ?? [])
    bytes += set.asepritePixels?.byteLength ?? set.pixels.byteLength;
  return bytes || document.width * document.height * ((timeline.colorDepth ?? 32) / 8);
}

export function useSpritePropertiesManager() {
  const source = useDialogEditorSource();
  const document = source.document;
  const documentKey = source.documentKey;
  const timeline = document?.timeline;
  const palette = timeline?.frames[timeline.activeFrame]?.palette ?? document?.palette;
  const ratio = timeline?.pixelRatio ?? ([1, 1] as const);
  const profile =
    timeline && Object.prototype.hasOwnProperty.call(timeline, "colorProfile")
      ? (timeline.colorProfile ?? undefined)
      : timeline?.asepriteSource?.colorProfile;
  const userData =
    timeline && Object.prototype.hasOwnProperty.call(timeline, "userData")
      ? timeline.userData
      : timeline?.asepriteSource?.userData;
  const view: SpritePropertiesView | null =
    document && documentKey !== null
      ? {
          documentKey,
          name: document.name,
          width: document.width,
          height: document.height,
          depth: timeline?.colorDepth ?? 32,
          frameCount: timeline?.frames.length ?? 1,
          paletteLength: palette?.length ?? 0,
          pixelRatio: ratio,
          transparentIndex:
            timeline?.transparentIndex ?? timeline?.asepriteSource?.header?.transparentIndex ?? 0,
          useLayerUuids:
            timeline?.useLayerUuids ??
            !!(timeline?.asepriteSource?.flags && timeline.asepriteSource.flags & 4),
          userData: userData
            ? {
                text: userData.text,
                color: userData.color
                  ? ([...userData.color] as [number, number, number, number])
                  : undefined,
                properties: userData.properties,
              }
            : undefined,
          colorProfile: profile,
          byteCount: spriteByteCount(document),
        }
      : null;
  return {
    view,
    setProperties(properties: SpritePropertiesEditView): boolean {
      if (!source.core || !source.document || !source.isCurrentTarget(source.target)) return false;
      source.core.sprite?.setProperties?.(properties as SpriteProperties);
      return true;
    },
    formatColor: rgbaToHex,
    maxChannelValue: UINT8_MAX,
  };
}
