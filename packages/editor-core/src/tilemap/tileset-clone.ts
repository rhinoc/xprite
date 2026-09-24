import type { AsepriteTileset, AsepriteUserData } from "$/import-export/aseprite/model";
const cloneUserData = (data: AsepriteUserData | undefined): AsepriteUserData | undefined =>
  data
    ? {
        ...data,
        ...(data.color ? { color: [...data.color] as [number, number, number, number] } : {}),
        ...(data.properties ? { properties: data.properties.slice() } : {}),
      }
    : undefined;
/** Core builds do not depend on browser structuredClone. */
export function cloneTileset(set: AsepriteTileset): AsepriteTileset {
  return {
    ...set,
    pixels: set.pixels.slice(),
    asepritePixels: set.asepritePixels?.slice(),
    userData: cloneUserData(set.userData),
    tileUserData: set.tileUserData?.map((data) => cloneUserData(data) ?? {}),
  };
}
