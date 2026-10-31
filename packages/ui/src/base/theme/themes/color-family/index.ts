import { loadStylesheet } from "$/base/theme/load-stylesheet";
import type { UiTheme } from "$/base/theme/theme-definition";
import { UiColorScheme } from "$/base/theme/theme-types";
import { asepriteCursors } from "$/base/theme/themes/aseprite/cursors";
import { asepriteControlParts, asepriteSkinTokens } from "$/base/theme/themes/aseprite/skin";
import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";
import { recolorAtlas } from "$/base/theme/themes/color-family/atlas-recolor";
import {
  COLOR_FAMILIES,
  ColorIntensity,
  colorFamilyColors,
  colorFamilyEditorTokens,
  type ColorFamily,
} from "$/base/theme/themes/color-family/families";

const ATLAS_MIME = "image/png";

function loadAsepriteModule(colorScheme: UiColorScheme) {
  return colorScheme === UiColorScheme.Dark
    ? import("$/base/theme/generated/themes/aseprite-dark")
    : import("$/base/theme/generated/themes/aseprite-light");
}

async function readAtlas(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Cannot create theme atlas surface");
  context.drawImage(image, 0, 0);
  return { canvas, context, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
}

async function recoloredAtlasUrl(
  sourceUrl: string,
  apply: (pixels: ImageData) => void,
): Promise<string> {
  const { canvas, context, pixels } = await readAtlas(sourceUrl);
  apply(pixels);
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, ATLAS_MIME));
  if (!blob) throw new Error("Cannot encode theme atlas");
  return URL.createObjectURL(blob);
}

function colorFamilyTheme(family: ColorFamily): UiTheme {
  return {
    id: `color-family-${family.id}`,
    label: family.intensity === ColorIntensity.Vivid ? `${family.label} Vivid` : family.label,
    cursors: asepriteCursors,
    typography: asepriteTypography,
    async loadCjkFonts() {
      const href = (await import("$assets/fonts/aseprite/cjk-fonts.css?url")).default;
      await loadStylesheet(href);
    },
    async load(colorScheme) {
      await import("$assets/fonts/aseprite/fonts.css");
      const { themeDefinition, sheetUrl } = await loadAsepriteModule(colorScheme);
      const colors = colorFamilyColors(themeDefinition.colors, family, colorScheme);
      const atlasUrl = await recoloredAtlasUrl(sheetUrl, (pixels) =>
        recolorAtlas(
          pixels,
          themeDefinition.parts,
          themeDefinition.colors,
          colors,
          family,
          colorScheme,
        ),
      );
      return {
        definition: {
          ...themeDefinition,
          colors,
          typography: asepriteTypography,
          controlParts: asepriteControlParts(),
        },
        sheetUrl: atlasUrl,
        tokens: {
          ...asepriteSkinTokens(colors, colorScheme),
          ...colorFamilyEditorTokens(family, colorScheme),
        },
      };
    },
  };
}

/** Editor color themes, in menu order; each loads its own light and dark scheme. */
export const colorFamilyThemes: readonly UiTheme[] = COLOR_FAMILIES.map(colorFamilyTheme);
