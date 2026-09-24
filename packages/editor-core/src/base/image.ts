/** Original Aseprite pixel samples carried alongside their RGBA preview. */
export interface AsepriteImageSamples {
  depth: 8 | 16;
  width: number;
  height: number;
  data: Uint8Array;
}
