import type { AsepriteSprite, AsepriteUserData } from "$/import-export/aseprite/model";
import {
  AsepriteUserPropertyType,
  decodeAsepriteUserPropertyMaps,
  encodeAsepriteUserPropertyMaps,
} from "$/import-export/aseprite/user-properties";
import { assertAnimationLoopCount } from "$/timeline/animation-loop";

const EXTENSION_ID = "xprite";
const EXTENSION_PROPERTIES_TYPE = 2;
const LOOP_PROPERTY = "animation.loopCount";
type ExternalFiles = NonNullable<AsepriteSprite["externalFiles"]>;

/** Standard ASE extension property map, without modifying user text or authored tags. */
export function parseAnimationLoopMetadata(
  sprite: Pick<AsepriteSprite, "externalFiles" | "userData">,
): number | undefined {
  const extension = sprite.externalFiles?.find(
    (file) => file.type === EXTENSION_PROPERTIES_TYPE && file.fileName === EXTENSION_ID,
  );
  if (!extension || !sprite.userData?.properties?.length) return undefined;
  const property = decodeAsepriteUserPropertyMaps(sprite.userData.properties)
    .find((map) => map.key === extension.id)
    ?.properties.find((entry) => entry.name === LOOP_PROPERTY);
  if (!property) return undefined;
  if (property.value.type !== AsepriteUserPropertyType.Uint32)
    throw new Error("Invalid animation play-count property type");
  return assertAnimationLoopCount(property.value.value);
}

export function withAnimationLoopMetadata(
  externalFiles: ExternalFiles | undefined,
  userData: AsepriteUserData | undefined,
  count: number | undefined,
): { externalFiles: ExternalFiles | undefined; userData: AsepriteUserData | undefined } {
  const files = [...(externalFiles ?? [])];
  let extension = files.find(
    (file) => file.type === EXTENSION_PROPERTIES_TYPE && file.fileName === EXTENSION_ID,
  );
  if (count === undefined && !extension) return { externalFiles, userData };
  if (count !== undefined) assertAnimationLoopCount(count);
  const bytes = userData?.properties;
  const maps = bytes?.length ? decodeAsepriteUserPropertyMaps(bytes) : [];
  if (!extension) {
    const used = new Set([...files.map((file) => file.id), ...maps.map((map) => map.key)]);
    let id = 1;
    while (used.has(id)) id++;
    extension = { id, type: EXTENSION_PROPERTIES_TYPE, fileName: EXTENSION_ID };
    files.push(extension);
  }
  const extensionKey = extension.id;
  let map = maps.find((candidate) => candidate.key === extensionKey);
  if (!map) {
    map = { key: extension.id, properties: [] };
    maps.push(map);
  }
  map.properties = map.properties.filter((property) => property.name !== LOOP_PROPERTY);
  if (count !== undefined)
    map.properties.push({
      name: LOOP_PROPERTY,
      value: { type: AsepriteUserPropertyType.Uint32, value: count },
    });
  const encoded = encodeAsepriteUserPropertyMaps(maps);
  const length = bytes?.length
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true)
    : 0;
  const trailing = bytes?.slice(length) ?? new Uint8Array();
  const block = encoded.length ? encoded : Uint8Array.of(8, 0, 0, 0, 0, 0, 0, 0);
  const properties = new Uint8Array(block.length + trailing.length);
  properties.set(block);
  properties.set(trailing, block.length);
  return {
    externalFiles: files,
    userData: {
      ...userData,
      properties: encoded.length || trailing.length ? properties : undefined,
    },
  };
}
