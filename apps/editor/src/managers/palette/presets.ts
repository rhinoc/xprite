import { tUi } from "$/i18n";
import { createPaletteFromSprite } from "$/managers/palette/palette-operations";
import paletteCatalog from "$assets/palette-presets/catalog.json";
import { browserLocalStorage as localStorage } from "@xprite/bedrock/browser/localstorage";
import { MAX_PALETTE_COLORS, MIN_PALETTE_COLORS, type Rgba } from "@xprite/editor-core";
import { UINT8_MAX, type PixelBuffer } from "@xprite/editor-core/base";
import { AsepriteCelType, AsepriteLayerType } from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const defaultKey = "xse.palette.default.v2";
const presetsKey = "xse.palette.presets.v1";
const IMAGE_PALETTE_MAX_COLORS = 256;
const PALETTE_IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|avif|ico|tiff?|svg)$/i;
const bundledPaletteFiles = import.meta.glob("../../../assets/palette-presets/**/*.gpl", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export interface BundledPalettePreset {
  id: string;
  name: string;
  group: string;
  author: string | null;
  authorUrl: string | null;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string | null;
  colors: Rgba[];
}

/** Match Aseprite's base::compare_filenames for preset resource names. */
export function comparePaletteResourceNames(a: string, b: string): number {
  let ai = 0,
    bi = 0;
  while (ai < a.length && bi < b.length) {
    const ac = a.charCodeAt(ai),
      bc = b.charCodeAt(bi);
    const aDigit = ac >= 48 && ac <= 57,
      bDigit = bc >= 48 && bc <= 57;
    if (aDigit && bDigit) {
      let an = 0,
        bn = 0;
      while (ai < a.length) {
        const digit = a.charCodeAt(ai) - 48;
        if (digit < 0 || digit > 9) break;
        an = an * 10 + digit;
        ai++;
      }
      while (bi < b.length) {
        const digit = b.charCodeAt(bi) - 48;
        if (digit < 0 || digit > 9) break;
        bn = bn * 10 + digit;
        bi++;
      }
      if (an !== bn) return an < bn ? -1 : 1;
      continue;
    }
    const lowerA = ac >= 65 && ac <= 90 ? ac + 32 : ac;
    const lowerB = bc >= 65 && bc <= 90 ? bc + 32 : bc;
    if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
    ai++;
    bi++;
  }
  if (ai === a.length && bi === b.length) return 0;
  return ai === a.length ? -1 : 1;
}

let bundledPaletteCache: BundledPalettePreset[] | null = null;

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
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readDefaultPalette(): Rgba[] {
  const fallback = readBundledPalettePresets().find((preset) => preset.id === "PICO-8");
  return (
    copyPalette(readStorage(defaultKey)) ??
    fallback?.colors.map((color) => [...color] as unknown as Rgba) ??
    []
  );
}

export function saveDefaultPalette(colors: readonly Rgba[]): void {
  const valid = copyPalette(colors);
  if (!valid)
    throw new Error(
      tUi("ui.palette.validation.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
    );
  writeStorage(defaultKey, valid);
}

export interface PalettePreset {
  name: string;
  colors: Rgba[];
}

export interface PalettePresetPorts {
  decodeAsepriteBlob?: (blob: Blob, fileName: string) => Promise<SessionProject>;
  decodeImageBlob?: (blob: Blob) => Promise<PixelBuffer>;
}

/** Bundled palette presets are loaded from the repository catalog. */
export function readBundledPalettePresets(): BundledPalettePreset[] {
  if (!bundledPaletteCache) {
    const entries: BundledPalettePreset[] = [];
    for (const item of paletteCatalog as {
      id: string;
      name: string;
      file: string;
      group: string;
      author: string | null;
      authorUrl: string | null;
      license: string;
      licenseUrl?: string;
      sourceUrl?: string | null;
    }[]) {
      const path = `../../../assets/palette-presets/${item.file}`;
      const source = bundledPaletteFiles[path];
      if (!source) continue;
      try {
        entries.push({
          id: item.id,
          name: item.name,
          group: item.group,
          author: item.author,
          authorUrl: item.authorUrl,
          license: item.license,
          ...(item.licenseUrl ? { licenseUrl: item.licenseUrl } : {}),
          ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
          colors: parsePaletteText(source),
        });
      } catch {
        // A broken bundled palette should not prevent the remaining presets
        // from being available in the picker.
      }
    }
    bundledPaletteCache = entries;
  }
  return bundledPaletteCache.map((entry) => ({
    ...entry,
    colors: entry.colors.map((color) => [...color] as unknown as Rgba),
  }));
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

export function deletePalettePreset(name: string): void {
  writeStorage(
    presetsKey,
    readPalettePresets().filter((entry) => entry.name !== name),
  );
}

function byte(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > UINT8_MAX)
    throw new Error(tUi("ui.palette.entries.must.contain.bytes.from.0.to", { value1: UINT8_MAX }));
  return n;
}

/** Parse the GIMP Palette `Channels: RGBA` extension when present. */
function parsePaletteText(source: string): Rgba[] {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
  if (lines[0] === "GIMP Palette") {
    const rgba = lines.some((line) => /^Channels:\s*RGBA$/i.test(line));
    const colors: Rgba[] = [];
    for (const line of lines.slice(1)) {
      if (!line || line.startsWith("#") || /^[A-Za-z][A-Za-z ]*:/.test(line)) continue;
      const values = line.split(/\s+/);
      if (values.length < (rgba ? 4 : 3)) throw new Error("Invalid GIMP palette entry.");
      colors.push([
        byte(values[0]),
        byte(values[1]),
        byte(values[2]),
        rgba ? byte(values[3]) : UINT8_MAX,
      ]);
    }
    if (colors.length < MIN_PALETTE_COLORS || colors.length > MAX_PALETTE_COLORS)
      throw new Error(
        tUi("ui.palette.size.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
      );
    return colors;
  }
  if (lines[0] === "JASC-PAL" && lines[1] === "0100") {
    const count = Number(lines[2]);
    if (!Number.isInteger(count) || count < MIN_PALETTE_COLORS || count > MAX_PALETTE_COLORS)
      throw new Error(
        tUi("ui.palette.size.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
      );
    const colors = lines.slice(3, 3 + count).map((line) => {
      const values = line.split(/\s+/);
      if (values.length < 3) throw new Error("Invalid JASC palette entry.");
      return [byte(values[0]), byte(values[1]), byte(values[2]), UINT8_MAX] as Rgba;
    });
    if (colors.length !== count) throw new Error("Palette file ended before all colors were read.");
    return colors;
  }
  throw new Error("Choose a GIMP (.gpl) or JASC (.pal) palette file.");
}

export function serializeGplPalette(colors: readonly Rgba[], name = "Palette"): string {
  const valid = copyPalette(colors);
  if (!valid)
    throw new Error(
      tUi("ui.palette.validation.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
    );
  const hasAlpha = valid.some((color) => color[3] !== UINT8_MAX);
  const header = [
    "GIMP Palette",
    `Name: ${name.replace(/[\r\n]/g, " ")}`,
    ...(hasAlpha ? ["Channels: RGBA"] : []),
    "#",
  ];
  return (
    [...header, ...valid.map((color) => (hasAlpha ? color : color.slice(0, 3)).join(" "))].join(
      "\n",
    ) + "\n"
  );
}

/** Aseprite palette files are tiny RGBA sprites carrying the palette chunk. */
export async function serializeAsePalette(colors: readonly Rgba[]): Promise<Uint8Array> {
  const valid = copyPalette(colors);
  if (!valid)
    throw new Error(
      tUi("ui.palette.validation.limit", { min: MIN_PALETTE_COLORS, max: MAX_PALETTE_COLORS }),
    );
  const { encodeAsepriteSync } = await import("@xprite/editor-core/import-export");
  return encodeAsepriteSync({
    width: 1,
    height: 1,
    depth: 32,
    flags: 1,
    format: "ase",
    tags: [],
    chunks: [],
    header: {
      fileSize: 0,
      magic: 0xa5e0,
      speed: 100,
      next: 0,
      frit: 0,
      transparentIndex: 0,
      ncolors: valid.length,
      pixelWidth: 1,
      pixelHeight: 1,
      gridX: 0,
      gridY: 0,
      gridWidth: 16,
      gridHeight: 16,
      ignore: [0, 0, 0],
    },
    palette: { entries: valid.map(([red, green, blue, alpha]) => ({ red, green, blue, alpha })) },
    layers: [
      {
        index: 0,
        type: AsepriteLayerType.Image,
        flags: 3,
        visible: true,
        editable: true,
        locked: false,
        background: false,
        collapsed: false,
        reference: false,
        continuous: false,
        name: "Palette",
        childLevel: 0,
        blendMode: 0,
        opacity: UINT8_MAX,
        defaultWidth: 1,
        defaultHeight: 1,
      },
    ],
    frames: [
      {
        index: 0,
        duration: 100,
        cels: [
          {
            layerIndex: 0,
            x: 0,
            y: 0,
            opacity: UINT8_MAX,
            zIndex: 0,
            type: AsepriteCelType.Raw,
            width: 1,
            height: 1,
            pixels: new Uint8Array(4),
            rawType: 0,
          },
        ],
      },
    ],
  });
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
  if (file.type.startsWith("image/") || PALETTE_IMAGE_EXTENSION.test(file.name)) {
    if (!ports.decodeImageBlob) throw new Error(tUi("ui.image.palette.decoder.unavailable"));
    // Image palettes use the first displayed frame, preserve RGBA (including
    // transparency), and order colors by pixel frequency. The shared extractor
    // bounds memory and reduces photographs to 256 entries.
    return createPaletteFromSprite(await ports.decodeImageBlob(file), IMAGE_PALETTE_MAX_COLORS);
  }
  return parsePaletteText(await file.text());
}
