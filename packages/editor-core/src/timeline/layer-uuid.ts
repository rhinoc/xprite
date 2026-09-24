import type { AsepriteLayer } from "$/import-export/aseprite/model";
import type { SpriteTimeline } from "$/timeline/types";

const UUID_BYTE_LENGTH = 16;
const UUID_VERSION_OFFSET = 6;
const UUID_VARIANT_OFFSET = 8;
const UUID_VERSION_MASK = 0x0f;
const UUID_VARIANT_MASK = 0x3f;
const UUID_VERSION_FOUR = 0x40;
const UUID_VARIANT_RFC = 0x80;
const BYTE_VALUE_COUNT = 256;

export function createLayerUuid(): Uint8Array {
  const uuid = new Uint8Array(UUID_BYTE_LENGTH);
  const crypto = (
    globalThis as typeof globalThis & {
      crypto?: { getRandomValues?: (values: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (crypto?.getRandomValues) crypto.getRandomValues(uuid);
  else for (let i = 0; i < uuid.length; i++) uuid[i] = Math.floor(Math.random() * BYTE_VALUE_COUNT);
  uuid[UUID_VERSION_OFFSET] = (uuid[UUID_VERSION_OFFSET] & UUID_VERSION_MASK) | UUID_VERSION_FOUR;
  uuid[UUID_VARIANT_OFFSET] = (uuid[UUID_VARIANT_OFFSET] & UUID_VARIANT_MASK) | UUID_VARIANT_RFC;
  return uuid;
}

export function layerUuidsEnabled(timeline: SpriteTimeline): boolean {
  return (
    timeline.useLayerUuids ??
    timeline.layers.some((layer) => layer.source?.uuid?.byteLength === UUID_BYTE_LENGTH)
  );
}

/** Assign identity before history/recovery captures a new layer. Existing UUIDs
 * stay intact, and encoding never has to substitute an all-zero identifier. */
export function ensureLayerUuids(timeline: SpriteTimeline): SpriteTimeline {
  if (!layerUuidsEnabled(timeline)) return timeline;
  let changed = false;
  const layers = timeline.layers.map((layer) => {
    const uuid = layer.source?.uuid;
    if (uuid?.byteLength === UUID_BYTE_LENGTH && uuid.some((byte) => byte !== 0)) return layer;
    changed = true;
    return {
      ...layer,
      source: { ...layer.source, uuid: createLayerUuid() } as AsepriteLayer,
    };
  });
  return changed ? { ...timeline, layers } : timeline;
}
