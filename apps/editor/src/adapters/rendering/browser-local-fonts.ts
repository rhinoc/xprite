import type { LocalFontsPort } from "$/managers/ports/local-fonts";
import { browserLocalFonts, type LocalFontMetadata } from "@xprite/bedrock/browser/local-fonts";
import { readFontBitmapSizes } from "@xprite/bedrock/common/font-bitmap-sizes";

export function createBrowserLocalFontsPort(): LocalFontsPort {
  const faces = new Map<string, LocalFontMetadata[]>();
  const requestFamilies = () =>
    browserLocalFonts.query().then((fonts) => {
      faces.clear();
      for (const font of fonts) {
        const key = font.family.trim().toLowerCase();
        const familyFaces = faces.get(key) ?? [];
        familyFaces.push(font);
        faces.set(key, familyFaces);
      }
      return fonts.map((font) => font.family);
    });
  return {
    available: () => browserLocalFonts.available(),
    async readGrantedFamilies() {
      return (await browserLocalFonts.permissionGranted()) ? requestFamilies() : null;
    },
    requestFamilies,
    async readBitmapSizes(family) {
      const sizes = new Set<number>();
      // Read one family's faces sequentially so large fonts are not all held in memory.
      for (const font of faces.get(family.trim().toLowerCase()) ?? []) {
        const bytes = new Uint8Array(await (await font.blob()).arrayBuffer());
        for (const size of readFontBitmapSizes(bytes)) sizes.add(size);
      }
      return [...sizes].sort((left, right) => left - right);
    },
  };
}
