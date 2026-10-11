import { tUi } from "$/i18n";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";
import { browserLocalStorage as localStorage } from "@xprite/bedrock/browser/localstorage";
import {
  MAX_PALETTE_COLORS,
  MIN_PALETTE_COLORS,
  quantizePalette,
  type Rgba,
} from "@xprite/editor-core";
import { UINT8_MAX, type PixelBuffer } from "@xprite/editor-core/base";
import {
  PaletteFileFormat,
  EDITOR_DEFAULT_PALETTE_KEY,
  EDITOR_PALETTE_PRESETS_KEY,
  readStoredPalette,
  readPaletteData,
  serializePaletteFile,
  type AsepriteColorProfile,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";
import { readBundledPalettePresets } from "@xprite/editor-ui/palette-presets";

const defaultKey = EDITOR_DEFAULT_PALETTE_KEY;
const presetsKey = EDITOR_PALETTE_PRESETS_KEY;
const IMAGE_PALETTE_MAX_COLORS = 256;
const PALETTE_IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|avif|ico|tiff?|svg)$/i;
function copyPalette(value: unknown): Rgba[] | null {
  if (
    !Array.isArray(value) ||
    value.length < MIN_PALETTE_COLORS ||
    value.length > MAX_PALETTE_COLORS
  )
    return null;
  const result: Rgba[] = [];
  for (const color of value) {
    if (
      !Array.isArray(color) ||
      color.length !== 4 ||
      color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > UINT8_MAX)
    )
      return null;
    result.push([color[0], color[1], color[2], color[3]]);
  }
  return result;
}

function readStorage(key: string): unknown {
  try {
    return createJsonStorage(localStorage).readJson(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  createJsonStorage(localStorage).writeJson(key, value);
}

export function readDefaultPalette(): Rgba[] {
  const bundled = readBundledPalettePresets();
  const fallback =
    bundled.find((preset) => preset.id === "DB32") ??
    bundled.find((preset) => preset.id === "VGA 13h");
  const saved = readStoredPalette(JSON.stringify(readStorage(defaultKey)));
  return copyPalette(saved) ?? fallback?.colors.map((color) => [...color] as unknown as Rgba) ?? [];
}

export function saveDefaultPalette(colors: readonly Rgba[], profile?: AsepriteColorProfile): void {
  const valid = copyPalette(colors);
  if (!valid)
    throw new Error(
      tUi("ui.palette.validation.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
    );
  writeStorage(defaultKey, {
    name: "default.ase",
    bytes: Array.from(serializePaletteFile(valid, PaletteFileFormat.Aseprite, profile)),
  });
}

export interface PalettePreset {
  name: string;
  colors: Rgba[];
}

export interface PalettePresetPorts {
  decodePaletteImageBytes?: (
    bytes: Uint8Array,
    name: string,
  ) => Promise<{ pixels: PixelBuffer; alpha: boolean; grayscale: boolean } | null>;
  decodeAsepriteBlob?: (blob: Blob, fileName: string) => Promise<SessionProject>;
  decodeImageBlob?: (blob: Blob) => Promise<PixelBuffer>;
}

export function readPalettePresets(): PalettePreset[] {
  const saved = readStorage(presetsKey);
  if (!Array.isArray(saved)) return [];
  return saved
    .flatMap((entry): PalettePreset[] => {
      if (!entry || typeof entry !== "object") return [];
      const name = (entry as { name?: unknown }).name;
      const colors = copyPalette((entry as { colors?: unknown }).colors);
      return typeof name === "string" && name.trim() && colors ? [{ name, colors }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function savePalettePreset(name: string, colors: readonly Rgba[]): void {
  const clean = name.trim();
  const valid = copyPalette(colors);
  if (!clean || clean.length > 80) throw new Error("Enter a preset name of 1 to 80 characters.");
  if (!valid)
    throw new Error(
      tUi("ui.palette.validation.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
    );
  const entries = readPalettePresets().filter(
    (entry) => entry.name.toLowerCase() !== clean.toLowerCase(),
  );
  entries.push({ name: clean, colors: valid });
  writeStorage(presetsKey, entries);
}

function parsePaletteText(source: string): Rgba[] {
  return readPaletteData(
    new TextEncoder().encode(source),
    source.trimStart().startsWith("JASC-PAL") ? "pal" : "gpl",
  )!;
}

export async function readPaletteFile(file: File, ports: PalettePresetPorts = {}): Promise<Rgba[]> {
  if (/\.(?:ase|aseprite)$/i.test(file.name)) {
    if (!ports.decodeAsepriteBlob)
      throw new Error("Aseprite palette decoding is unavailable in this editor context.");
    const project = await ports.decodeAsepriteBlob(file, file.name);
    const colors = copyPalette(project.palette);
    if (!colors) throw new Error("This sprite contains no usable palette.");
    return colors;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raster = await ports.decodePaletteImageBytes?.(bytes, file.name);
  const embedded = readPaletteData(bytes, file.name.split(".").pop() ?? "");
  if (embedded) return embedded;
  if (raster?.grayscale)
    return Array.from({ length: IMAGE_PALETTE_MAX_COLORS }, (_, index) => [
      index,
      index,
      index,
      UINT8_MAX,
    ]);
  if (raster)
    return quantizePalette(
      [raster.pixels],
      IMAGE_PALETTE_MAX_COLORS,
      true,
      undefined,
      raster.alpha ? 0 : -1,
    );
  if (file.type.startsWith("image/") || PALETTE_IMAGE_EXTENSION.test(file.name)) {
    if (!ports.decodeImageBlob) throw new Error(tUi("ui.image.palette.decoder.unavailable"));
    const image = await ports.decodeImageBlob(file);
    const opaque = /\.png$/i.test(file.name)
      ? bytes[25] === 2
      : image.data.every((channel, index) => index % 4 !== 3 || channel === UINT8_MAX);
    return quantizePalette([image], IMAGE_PALETTE_MAX_COLORS, true, undefined, opaque ? -1 : 0);
  }
  return parsePaletteText(await file.text());
}
