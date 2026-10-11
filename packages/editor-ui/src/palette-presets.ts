import type { Rgba } from "@xprite/editor-core/base";
import { parsePaletteText, comparePaletteResourceNames } from "@xprite/editor-core/import-export";
import palette3 from "@xprite/palette-assets/adigunpolack-palettes/aap-radiantxv.gpl?raw";
import catalogSource from "@xprite/palette-assets/catalog.json?raw";
import palette0 from "@xprite/palette-assets/libresprite/a64.gpl?raw";
import palette1 from "@xprite/palette-assets/libresprite/aap-16.gpl?raw";
import palette2 from "@xprite/palette-assets/libresprite/aap-64.gpl?raw";
import palette4 from "@xprite/palette-assets/libresprite/aap-splendor128.gpl?raw";
import palette5 from "@xprite/palette-assets/libresprite/apple-ii.gpl?raw";
import palette6 from "@xprite/palette-assets/libresprite/arne-paldac.gpl?raw";
import palette7 from "@xprite/palette-assets/libresprite/arne16.gpl?raw";
import palette8 from "@xprite/palette-assets/libresprite/arne32.gpl?raw";
import palette9 from "@xprite/palette-assets/libresprite/atari2600-ntsc.gpl?raw";
import palette10 from "@xprite/palette-assets/libresprite/atari2600-pal.gpl?raw";
import palette12 from "@xprite/palette-assets/libresprite/cg-arne.gpl?raw";
import palette11 from "@xprite/palette-assets/libresprite/cga.gpl?raw";
import palette15 from "@xprite/palette-assets/libresprite/commodore-plus4.gpl?raw";
import palette16 from "@xprite/palette-assets/libresprite/commodore-vic20.gpl?raw";
import palette14 from "@xprite/palette-assets/libresprite/commodore64.gpl?raw";
import palette17 from "@xprite/palette-assets/libresprite/copper-tech.gpl?raw";
import palette19 from "@xprite/palette-assets/libresprite/cpc-boy.gpl?raw";
import palette21 from "@xprite/palette-assets/libresprite/db16.gpl?raw";
import palette22 from "@xprite/palette-assets/libresprite/db32.gpl?raw";
import palette25 from "@xprite/palette-assets/libresprite/eroge-copper.gpl?raw";
import palette29 from "@xprite/palette-assets/libresprite/gameboy-color-type1.gpl?raw";
import palette28 from "@xprite/palette-assets/libresprite/gameboy.gpl?raw";
import palette30 from "@xprite/palette-assets/libresprite/google-ui.gpl?raw";
import palette33 from "@xprite/palette-assets/libresprite/jmp.gpl?raw";
import palette34 from "@xprite/palette-assets/libresprite/master-system.gpl?raw";
import palette35 from "@xprite/palette-assets/libresprite/monokai.gpl?raw";
import palette37 from "@xprite/palette-assets/libresprite/nes-ntsc.gpl?raw";
import palette36 from "@xprite/palette-assets/libresprite/nes.gpl?raw";
import palette38 from "@xprite/palette-assets/libresprite/pico-8.gpl?raw";
import palette39 from "@xprite/palette-assets/libresprite/psygnork.gpl?raw";
import palette43 from "@xprite/palette-assets/libresprite/smile-basic.gpl?raw";
import palette44 from "@xprite/palette-assets/libresprite/solarized.gpl?raw";
import palette45 from "@xprite/palette-assets/libresprite/teletext.gpl?raw";
import palette47 from "@xprite/palette-assets/libresprite/vga-13h.gpl?raw";
import palette48 from "@xprite/palette-assets/libresprite/web-safe-colors.gpl?raw";
import palette50 from "@xprite/palette-assets/libresprite/win16.gpl?raw";
import palette51 from "@xprite/palette-assets/libresprite/x11.gpl?raw";
import palette52 from "@xprite/palette-assets/libresprite/zx-spectrum.gpl?raw";
import palette13 from "@xprite/palette-assets/lospec/cl8uds.gpl?raw";
import palette27 from "@xprite/palette-assets/lospec/florentine24.gpl?raw";
import palette32 from "@xprite/palette-assets/lospec/jexru-64.gpl?raw";
import palette40 from "@xprite/palette-assets/lospec/resurrect-64.gpl?raw";
import palette42 from "@xprite/palette-assets/lospec/sepia6.gpl?raw";
import palette18 from "@xprite/palette-assets/paleto/cosmic-space.gpl?raw";
import palette20 from "@xprite/palette-assets/paleto/cyberpunk-neon-city.gpl?raw";
import palette23 from "@xprite/palette-assets/paleto/dead-city-post-apocalyptic.gpl?raw";
import palette24 from "@xprite/palette-assets/paleto/deep-sea.gpl?raw";
import palette26 from "@xprite/palette-assets/paleto/fantasy-rpg.gpl?raw";
import palette31 from "@xprite/palette-assets/paleto/horror-dark.gpl?raw";
import palette41 from "@xprite/palette-assets/paleto/retro-8-bit.gpl?raw";
import palette46 from "@xprite/palette-assets/paleto/underwater-ruins.gpl?raw";
import palette49 from "@xprite/palette-assets/paleto/western-desert.gpl?raw";
export interface BundledPalettePreset {
  id: string;
  name: string;
  file: string;
  group: string;
  author: string | null;
  authorUrl: string | null;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string | null;
  colors: Rgba[];
}
const resources: Record<string, string> = {
  "libresprite/a64.gpl": palette0,
  "libresprite/aap-16.gpl": palette1,
  "libresprite/aap-64.gpl": palette2,
  "adigunpolack-palettes/aap-radiantxv.gpl": palette3,
  "libresprite/aap-splendor128.gpl": palette4,
  "libresprite/apple-ii.gpl": palette5,
  "libresprite/arne-paldac.gpl": palette6,
  "libresprite/arne16.gpl": palette7,
  "libresprite/arne32.gpl": palette8,
  "libresprite/atari2600-ntsc.gpl": palette9,
  "libresprite/atari2600-pal.gpl": palette10,
  "libresprite/cga.gpl": palette11,
  "libresprite/cg-arne.gpl": palette12,
  "lospec/cl8uds.gpl": palette13,
  "libresprite/commodore64.gpl": palette14,
  "libresprite/commodore-plus4.gpl": palette15,
  "libresprite/commodore-vic20.gpl": palette16,
  "libresprite/copper-tech.gpl": palette17,
  "paleto/cosmic-space.gpl": palette18,
  "libresprite/cpc-boy.gpl": palette19,
  "paleto/cyberpunk-neon-city.gpl": palette20,
  "libresprite/db16.gpl": palette21,
  "libresprite/db32.gpl": palette22,
  "paleto/dead-city-post-apocalyptic.gpl": palette23,
  "paleto/deep-sea.gpl": palette24,
  "libresprite/eroge-copper.gpl": palette25,
  "paleto/fantasy-rpg.gpl": palette26,
  "lospec/florentine24.gpl": palette27,
  "libresprite/gameboy.gpl": palette28,
  "libresprite/gameboy-color-type1.gpl": palette29,
  "libresprite/google-ui.gpl": palette30,
  "paleto/horror-dark.gpl": palette31,
  "lospec/jexru-64.gpl": palette32,
  "libresprite/jmp.gpl": palette33,
  "libresprite/master-system.gpl": palette34,
  "libresprite/monokai.gpl": palette35,
  "libresprite/nes.gpl": palette36,
  "libresprite/nes-ntsc.gpl": palette37,
  "libresprite/pico-8.gpl": palette38,
  "libresprite/psygnork.gpl": palette39,
  "lospec/resurrect-64.gpl": palette40,
  "paleto/retro-8-bit.gpl": palette41,
  "lospec/sepia6.gpl": palette42,
  "libresprite/smile-basic.gpl": palette43,
  "libresprite/solarized.gpl": palette44,
  "libresprite/teletext.gpl": palette45,
  "paleto/underwater-ruins.gpl": palette46,
  "libresprite/vga-13h.gpl": palette47,
  "libresprite/web-safe-colors.gpl": palette48,
  "paleto/western-desert.gpl": palette49,
  "libresprite/win16.gpl": palette50,
  "libresprite/x11.gpl": palette51,
  "libresprite/zx-spectrum.gpl": palette52,
};
const catalog = JSON.parse(catalogSource) as Omit<BundledPalettePreset, "colors">[];
let cache: BundledPalettePreset[] | undefined;
export function readBundledPalettePresets(): BundledPalettePreset[] {
  cache ??= catalog
    .flatMap((item) => {
      const source = resources[item.file];
      if (!source) return [];
      try {
        return [{ ...item, colors: parsePaletteText(source) }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => comparePaletteResourceNames(a.name, b.name));
  return cache.map((entry) => ({
    ...entry,
    colors: entry.colors.map((color) => [...color] as Rgba),
  }));
}
