import { zlibSync } from "fflate";

export const deflateTileData = (bytes: Uint8Array): Uint8Array => zlibSync(bytes);
