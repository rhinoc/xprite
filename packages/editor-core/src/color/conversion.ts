import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import {
  workingColorProfile,
  colorProfileToSrgb,
  convertPixelsToSrgb,
  parseIccProfile,
} from "$/color/icc-profile";
import {
  paletteForColors,
  expandAsepriteSamples,
  asepriteLuminance,
  asepriteRgbMap,
  type AsepriteImageSamples,
} from "$/color/samples";
import { activateTimelineCel, ensureTimeline, syncTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { refreshTilemapProjections } from "$/tilemap/model";
import { type SpriteTimeline, type TimelineCel } from "$/timeline/timeline";

export type SpriteColorDepth = 8 | 16 | 32;
export interface ColorModeConversionOptions {
  /** Indexed conversion uses the document palette unless a palette is supplied. */
  palette?: readonly Rgba[];
  dither?: "none" | "ordered" | "floyd-steinberg";
  grayscale?: "luma" | "hsv" | "hsl";
}

export const grayscalePalette = (): Rgba[] =>
  Array.from({ length: 256 }, (_, value) => [value, value, value, UINT8_MAX] as Rgba);
export const defaultIndexedPalette = (): Rgba[] =>
  Array.from({ length: 256 }, (_, index) =>
    index === 0
      ? ([0, 0, 0, 0] as Rgba)
      : ([
          Math.round(((index - 1) * UINT8_MAX) / 254),
          Math.round(((index - 1) * UINT8_MAX) / 254),
          Math.round(((index - 1) * UINT8_MAX) / 254),
          UINT8_MAX,
        ] as Rgba),
  );

export function validateIndexedPalette(colors: readonly Rgba[]): Rgba[] {
  if (
    !Array.isArray(colors) ||
    colors.length < 1 ||
    colors.length > 256 ||
    colors.some(
      (color) =>
        !Array.isArray(color) ||
        color.length !== 4 ||
        color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > UINT8_MAX),
    )
  )
    throw new RangeError("Indexed palette must contain 1–256 RGBA colors");
  return colors.map((color) => [...color] as unknown as Rgba);
}

const grayValue = (
  r: number,
  g: number,
  b: number,
  method: NonNullable<ColorModeConversionOptions["grayscale"]>,
) =>
  method === "hsv"
    ? Math.max(r, g, b)
    : method === "hsl"
      ? Math.trunc((Math.max(r, g, b) + Math.min(r, g, b)) / 2)
      : asepriteLuminance(r, g, b);

function convertCel(
  image: PixelBuffer,
  depth: SpriteColorDepth,
  palette: readonly Rgba[],
  mask: number,
  background: boolean,
  options: ColorModeConversionOptions,
): { pixels: PixelBuffer; asepriteSamples?: AsepriteImageSamples } {
  const count = image.width * image.height;
  if (depth === 32) {
    const pixels = image.data.slice();
    if (background) for (let at = 3; at < pixels.length; at += 4) pixels[at] = UINT8_MAX;
    return { pixels: { ...image, data: pixels } };
  }
  const data = new Uint8Array(count * (depth / BITS_PER_BYTE));
  if (depth === 16) {
    const pixels = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) {
      const at = i * 4,
        value = grayValue(
          image.data[at],
          image.data[at + 1],
          image.data[at + 2],
          options.grayscale ?? "luma",
        ),
        alpha = background ? UINT8_MAX : image.data[at + 3];
      data[i * 2] = value;
      data[i * 2 + 1] = alpha;
      pixels.set([value, value, value, alpha], at);
    }
    return {
      pixels: { width: image.width, height: image.height, data: pixels },
      asepriteSamples: { depth, width: image.width, height: image.height, data },
    };
  }
  const destinationPalette = paletteForColors(palette),
    dither = options.dither ?? "none";
  const error = dither === "floyd-steinberg" ? new Float32Array(count * 3) : undefined;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = y * image.width + x,
        at = i * 4,
        alpha = image.data[at + 3];
      if (alpha === 0 && mask >= 0) {
        data[i] = mask;
        continue;
      }
      const correction = dither === "ordered" ? (bayer[(y & 3) * 4 + (x & 3)] - 7.5) * 2 : 0;
      const rgb = [0, 1, 2].map((channel) =>
        Math.max(
          0,
          Math.min(
            UINT8_MAX,
            Math.round(image.data[at + channel] + correction + (error?.[i * 3 + channel] ?? 0)),
          ),
        ),
      );
      const index = asepriteRgbMap(
        rgb[0],
        rgb[1],
        rgb[2],
        background ? UINT8_MAX : alpha,
        destinationPalette,
        mask,
      );
      data[i] = index;
      if (error) {
        const chosen = palette[index];
        for (let channel = 0; channel < 3; channel++) {
          const delta = rgb[channel] - chosen[channel];
          if (x + 1 < image.width) error[(i + 1) * 3 + channel] += (delta * 7) / 16;
          if (y + 1 < image.height) {
            if (x > 0) error[(i + image.width - 1) * 3 + channel] += (delta * 3) / 16;
            error[(i + image.width) * 3 + channel] += (delta * 5) / 16;
            if (x + 1 < image.width) error[(i + image.width + 1) * 3 + channel] += delta / 16;
          }
        }
      }
    }
  const asepriteSamples: AsepriteImageSamples = {
    depth,
    width: image.width,
    height: image.height,
    data,
  };
  return {
    pixels: {
      width: image.width,
      height: image.height,
      data: expandAsepriteSamples(asepriteSamples, destinationPalette, mask),
    },
    asepriteSamples,
  };
}

/** Convert source cel images while retaining linked image identity, as in
 * .refs/libresprite/src/app/cmd/set_pixel_format.cpp and src/doc/sprite.cpp::uniqueCels.
 * The first source frame supplies a linked image's palette; target frames
 * still project their own indexed samples. */
export function convertDocumentColorMode(
  doc: EditorDocument,
  depth: SpriteColorDepth,
  options: ColorModeConversionOptions = {},
): boolean {
  if (![8, 16, 32].includes(depth)) throw new RangeError("Invalid color depth");
  syncTimeline(doc);
  const source = ensureTimeline(doc),
    previousDepth = source.colorDepth ?? 32;
  if (previousDepth === depth) return false;
  const profile = workingColorProfile(source);
  const discardProfile =
    profile?.type === "icc" && (depth === 16 || parseIccProfile(profile.data).space === "GRAY");
  const transformPalette = (colors: readonly Rgba[] | undefined) =>
    discardProfile && profile ? colors?.map((color) => colorProfileToSrgb(color, profile)) : colors;
  const oldPalette =
    transformPalette(source.frames[source.activeFrame].palette ?? doc.palette ?? []) ?? [];
  const basePalette = options.palette ?? transformPalette(source.frames[0].palette) ?? oldPalette;
  const usablePalette = basePalette.some((color) => color[3] === UINT8_MAX)
    ? basePalette
    : defaultIndexedPalette();
  const indexedPalette =
    depth === 8 ? validateIndexedPalette(usablePalette.slice(0, 256)) : undefined;
  const mask =
    depth === 8
      ? Math.max(
          0,
          indexedPalette!.findIndex((color) => color[3] === 0),
        )
      : 0;
  const cache = new Map<
    PixelBuffer | AsepriteImageSamples,
    { pixels: PixelBuffer; asepriteSamples?: AsepriteImageSamples; palette?: readonly Rgba[] }
  >();
  const grayPalette = depth === 16 ? grayscalePalette() : undefined;
  const frames = source.frames.map((frame, frameIndex) => {
    const sourcePalette = transformPalette(frame.palette);
    const framePalette = depth === 8 ? sourcePalette?.slice(0, 256) : sourcePalette;
    const colors =
      depth === 16
        ? grayPalette
        : depth === 8
          ? options.palette
            ? indexedPalette!
            : framePalette?.some((color) => color[3] === UINT8_MAX)
              ? framePalette
              : indexedPalette!
          : framePalette;
    const cels = frame.cels.map((cel, layerIndex): TimelineCel | null => {
      if (!cel) return null;
      if (cel.tilemap)
        return {
          ...cel,
          asepriteSamples: undefined,
          opacity: depth === 8 ? UINT8_MAX : cel.opacity,
          source: undefined,
        };
      const key = cel.asepriteSamples ?? cel.pixels;
      let converted = cache.get(key);
      if (!converted) {
        const input =
          discardProfile && profile ? convertPixelsToSrgb(cel.pixels, profile) : cel.pixels;
        const palette = depth === 8 ? colors! : (framePalette ?? oldPalette);
        converted = {
          ...convertCel(
            input,
            depth,
            palette,
            source.layers[layerIndex].flags & 8 ? -1 : mask,
            !!(source.layers[layerIndex].flags & 8),
            options,
          ),
          palette: colors,
        };
        cache.set(key, converted);
      }
      let pixels = converted.pixels;
      if (depth === 8 && converted.asepriteSamples && colors !== converted.palette)
        pixels = {
          width: cel.pixels.width,
          height: cel.pixels.height,
          data: expandAsepriteSamples(
            converted.asepriteSamples,
            paletteForColors(colors),
            source.layers[layerIndex].flags & 8 ? -1 : mask,
          ),
        };
      return {
        ...cel,
        pixels,
        asepriteSamples: converted.asepriteSamples,
        opacity: depth === 8 ? UINT8_MAX : cel.opacity,
        source: undefined,
      };
    });
    return {
      ...frame,
      palette:
        depth === 16
          ? frameIndex === 0
            ? colors
            : undefined
          : depth === 8
            ? colors
            : framePalette,
      cels,
      source: undefined,
    };
  });
  const tilesets = source.tilesets?.map((set) => {
    const original: PixelBuffer = {
      width: set.tileWidth,
      height: set.tileHeight * set.tileCount,
      data:
        previousDepth !== 32 && set.asepritePixels
          ? expandAsepriteSamples(
              {
                depth: previousDepth,
                width: set.tileWidth,
                height: set.tileHeight * set.tileCount,
                data: set.asepritePixels,
              },
              paletteForColors(source.frames[0].palette ?? doc.palette),
              source.transparentIndex ?? 0,
            )
          : new Uint8ClampedArray(set.pixels),
    };
    const input = discardProfile && profile ? convertPixelsToSrgb(original, profile) : original;
    const converted = convertCel(
      input,
      depth,
      depth === 8 ? frames[0].palette! : oldPalette,
      mask,
      false,
      options,
    );
    return {
      ...set,
      pixels: new Uint8Array(converted.pixels.data),
      asepritePixels: converted.asepriteSamples?.data,
    };
  });
  const timeline: SpriteTimeline = {
    ...source,
    colorDepth: depth,
    transparentIndex: mask,
    frames,
    tilesets,
    ...(discardProfile ? { colorProfile: { type: "srgb" } as const } : {}),
  };
  doc.timeline = tilesets?.length ? refreshTilemapProjections(timeline) : timeline;
  doc.palette = depth === 16 ? frames[0].palette : depth === 8 ? indexedPalette : oldPalette;
  activateTimelineCel(doc, timeline.activeFrame, timeline.activeLayer);
  return true;
}

export function createAsepriteSpriteProject(
  width: number,
  height: number,
  depth: SpriteColorDepth,
  background: "transparent" | "white" | "black" = "transparent",
  suppliedPalette?: readonly Rgba[],
): { image: PixelBuffer; timeline: SpriteTimeline; palette: readonly Rgba[] } {
  if (![8, 16, 32].includes(depth)) throw new RangeError("Invalid color depth");
  if (!["transparent", "white", "black"].includes(background))
    throw new RangeError("Invalid sprite background");
  const opaque = background !== "transparent",
    value = background === "white" ? UINT8_MAX : 0;
  const palette =
    depth === 16
      ? grayscalePalette()
      : depth === 8
        ? validateIndexedPalette(
            suppliedPalette?.length && suppliedPalette.some((color) => color[3] === UINT8_MAX)
              ? suppliedPalette.slice(0, 256)
              : defaultIndexedPalette(),
          )
        : (suppliedPalette?.map((color) => [...color] as unknown as Rgba) ??
          defaultIndexedPalette());
  const pixels: PixelBuffer = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  const rgba: Rgba = [value, value, value, opaque ? UINT8_MAX : 0];
  if (opaque) for (let at = 0; at < pixels.data.length; at += 4) pixels.data.set(rgba, at);
  let asepriteSamples: AsepriteImageSamples | undefined;
  if (depth !== 32) {
    const data = new Uint8Array(width * height * (depth / BITS_PER_BYTE));
    if (depth === 16)
      for (let i = 0; i < width * height; i++) {
        data[i * 2] = value;
        data[i * 2 + 1] = opaque ? UINT8_MAX : 0;
      }
    else
      data.fill(
        opaque ? asepriteRgbMap(value, value, value, UINT8_MAX, paletteForColors(palette), -1) : 0,
      );
    asepriteSamples = { depth, width, height, data };
    pixels.data.set(
      expandAsepriteSamples(asepriteSamples, paletteForColors(palette), opaque ? -1 : 0),
    );
  }
  const timeline: SpriteTimeline = {
    colorDepth: depth,
    transparentIndex: 0,
    composeGroups: false,
    activeFrame: 0,
    activeLayer: 0,
    layers: [
      {
        id: "layer-1",
        name: opaque ? "Background" : "Layer 1",
        kind: "image",
        visible: true,
        locked: false,
        opacity: UINT8_MAX,
        flags: opaque ? 15 : 3,
      },
    ],
    frames: [
      {
        duration: 100,
        palette,
        cels: [{ pixels, asepriteSamples, x: 0, y: 0, opacity: UINT8_MAX, zIndex: 0 }],
      },
    ],
  };
  return { image: pixels, timeline, palette };
}
