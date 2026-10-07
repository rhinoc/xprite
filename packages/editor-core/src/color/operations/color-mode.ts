import { MAX_DOCUMENT_PIXEL_BYTES, MAX_IMAGE_DIMENSION } from "$/base/image-limits";
import { BITS_PER_BYTE, UINT8_MAX, UINT16_VALUE_COUNT } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import {
  expandAsepriteSamples,
  asepriteBestFit,
  asepriteRgbMap,
  paletteForColors,
  encodeAsepriteSamples,
  indexedPaletteColorIndex,
  type AsepriteImageSamples,
} from "$/color/samples";
import type { EditorDocument } from "$/document/types";
import { AsepriteInk } from "$/drawing/tool-settings";
import type { AsepritePalette } from "$/import-export/aseprite/model";
import { refreshTilemapProjections } from "$/tilemap/model";
import { cloneTileset } from "$/tilemap/tileset-clone";
import type { SpriteTimeline, TimelineCel } from "$/timeline/timeline";

function samePixels(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
import type { AsepriteIndexWriter } from "$/color/types";

function assignActive(doc: EditorDocument, t: SpriteTimeline) {
  const c = t.frames[t.activeFrame].cels[t.activeLayer];
  if (c)
    doc.layer = {
      ...doc.layer,
      pixels: c.pixels,
      x: c.x,
      y: c.y,
      celOpacity: c.opacity,
      zIndex: c.zIndex,
    };
  doc.palette = t.frames[t.activeFrame].palette ?? doc.palette;
}
/** Edit the current shared palette and keep linked indexed cel projections aligned. */
export function updateAsepriteFramePalette(
  doc: EditorDocument,
  colors: readonly Rgba[],
  frameIndex = doc.timeline?.activeFrame ?? 0,
): void {
  const t = doc.timeline;
  if (!t || !t.frames[frameIndex]) return;
  const old = t.frames[frameIndex].palette;
  if (old && colors.length === old.length && colors.every((c, i) => samePixels(c, old[i]))) return;
  let firstFrame = frameIndex,
    lastFrame = frameIndex;
  while (firstFrame > 0 && t.frames[firstFrame - 1].palette === old) firstFrame--;
  while (lastFrame + 1 < t.frames.length && t.frames[lastFrame + 1].palette === old) lastFrame++;
  const palette = colors.map((c) => [...c] as Rgba),
    cache = new Map<AsepriteImageSamples, PixelBuffer>();
  doc.timeline = {
    ...t,
    frames: t.frames.map((f, i) => {
      if (i < firstFrame || i > lastFrame) return f;
      return {
        ...f,
        palette,
        cels: f.cels.map((c, l) => {
          if (!c?.asepriteSamples || c.asepriteSamples.depth !== 8) return c;
          let pixels = cache.get(c.asepriteSamples);
          if (!pixels) {
            pixels = {
              width: c.asepriteSamples.width,
              height: c.asepriteSamples.height,
              data: expandAsepriteSamples(
                c.asepriteSamples,
                paletteForColors(palette),
                t.layers[l].flags & 8 ? -1 : (t.transparentIndex ?? 0),
              ),
            };
            cache.set(c.asepriteSamples, pixels);
          }
          return { ...c, pixels };
        }),
      };
    }),
  };
  if (t.tilesets?.length) doc.timeline = refreshTilemapProjections(doc.timeline);
  assignActive(doc, doc.timeline);
}
/** Call after syncTimeline, before indexed raster/structural history commit.
 * Aseprite sample bytes are immutable; shared image identity propagates edits across
 * linked cels even when their different frame palettes require separate RGBA. */
export function normalizeAsepriteDocument(doc: EditorDocument): boolean {
  let t = doc.timeline;
  if (!t) return false;
  const depth = t.colorDepth;
  if (
    doc.palette &&
    t.frames[t.activeFrame].palette &&
    doc.palette !== t.frames[t.activeFrame].palette
  )
    updateAsepriteFramePalette(doc, doc.palette);
  const paletteChanged = t !== doc.timeline;
  if (depth !== 8 && depth !== 16) return paletteChanged;
  t = doc.timeline!;
  const replacements = new Map<AsepriteImageSamples, AsepriteImageSamples>(),
    byPixels = new Map<PixelBuffer, AsepriteImageSamples>(),
    encodedCels = new Map<TimelineCel, AsepriteImageSamples>();
  let changed = false;
  // Active cel wins when linked projections have not yet been refreshed.
  const order = [t.activeFrame, ...t.frames.map((_, i) => i).filter((i) => i !== t!.activeFrame)];
  for (const fi of order) {
    const f = t.frames[fi],
      palette = paletteForColors(f.palette ?? doc.palette);
    for (let li = 0; li < t.layers.length; li++) {
      const c = f.cels[li];
      if (
        !c ||
        t.layers[li].kind === "group" ||
        c.tilemap ||
        (c.asepriteSamples && replacements.has(c.asepriteSamples))
      )
        continue;
      const image = encodeAsepriteSamples(
        c.pixels,
        depth,
        palette,
        t.layers[li].flags & 8 ? -1 : (t.transparentIndex ?? 0),
        c.asepriteSamples,
      );
      encodedCels.set(c, image);
      byPixels.set(c.pixels, image);
      if (c.asepriteSamples && image !== c.asepriteSamples)
        replacements.set(c.asepriteSamples, image);
      if (image !== c.asepriteSamples) changed = true;
    }
  }
  const projected = new Map<AsepriteImageSamples, Map<readonly Rgba[] | undefined, PixelBuffer>>();
  const frames = t.frames.map((f) => {
    const colors = f.palette ?? doc.palette,
      palette = paletteForColors(colors);
    let frameChanged = false;
    const cels = f.cels.map((c, li): TimelineCel | null => {
      if (!c || c.tilemap || t!.layers[li].kind === "group") return c;
      const asepriteSamples = c.asepriteSamples
        ? (replacements.get(c.asepriteSamples) ?? encodedCels.get(c) ?? c.asepriteSamples)
        : (encodedCels.get(c) ?? byPixels.get(c.pixels)!);
      let palettes = projected.get(asepriteSamples);
      if (!palettes) {
        palettes = new Map();
        projected.set(asepriteSamples, palettes);
      }
      const key = depth === 16 ? undefined : colors;
      let pixels = palettes.get(key);
      if (!pixels) {
        const data = expandAsepriteSamples(
          asepriteSamples,
          palette,
          t!.layers[li].flags & 8 ? -1 : (t!.transparentIndex ?? 0),
        );
        pixels = samePixels(data, c.pixels.data)
          ? c.pixels
          : { width: asepriteSamples.width, height: asepriteSamples.height, data };
        palettes.set(key, pixels);
      }
      if (asepriteSamples === c.asepriteSamples && pixels === c.pixels) return c;
      frameChanged = true;
      return { ...c, asepriteSamples, pixels };
    });
    return frameChanged ? { ...f, cels } : f;
  });
  if (changed || frames.some((f, i) => f !== t!.frames[i])) {
    doc.timeline = { ...t, frames };
    assignActive(doc, doc.timeline);
    return true;
  }
  return paletteChanged;
}
/** .refs/libresprite/src/app/color.cpp::Color::getIndex preserves explicit indices
 * and resolves typed RGB by exact match before palette best-fit. */
export function libreSpriteWorkingBrushIndex(
  color: Rgba,
  t: SpriteTimeline | undefined,
  palette: readonly Rgba[] | undefined,
  preferredIndex?: number,
): number | undefined {
  if (t?.colorDepth !== 8 || !palette?.length) return undefined;
  return indexedPaletteColorIndex(color, palette, preferredIndex);
}
/** Drawing gray uses HSL lightness; image conversion uses luminance instead. */
export function libreSpriteWorkingBrushColor(
  color: Rgba,
  t: SpriteTimeline | undefined,
  palette: readonly Rgba[] | undefined,
  preferredIndex?: number,
  ink?: string,
): Rgba {
  if (t?.colorDepth === 16) {
    const c =
      preferredIndex !== undefined && palette?.[preferredIndex] ? palette[preferredIndex] : color;
    const value = Math.trunc((Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 2);
    return [value, value, value, c[3]];
  }
  if (t?.colorDepth === 8 && palette?.length) {
    const index = libreSpriteWorkingBrushIndex(color, t, palette, preferredIndex)!;
    return index === (t.transparentIndex ?? 0) &&
      !(t.layers[t.activeLayer].flags & 8) &&
      ink !== AsepriteInk.LockAlpha
      ? [0, 0, 0, 0]
      : palette[index];
  }
  return color;
}
/** Isolate source sample ownership when installing a caller-supplied timeline. */
export function cloneAsepriteImageGraph(t: SpriteTimeline): SpriteTimeline {
  const tilemaps = new Map<
    NonNullable<TimelineCel["tilemap"]>,
    NonNullable<TimelineCel["tilemap"]>
  >();
  const images = new Map<AsepriteImageSamples, AsepriteImageSamples>(),
    palettes = new Map<readonly Rgba[], readonly Rgba[]>();
  return {
    ...t,
    ...(t.tilesets ? { tilesets: t.tilesets.map(cloneTileset) } : {}),
    ...(t.gridBounds ? { gridBounds: { ...t.gridBounds } } : {}),
    frames: t.frames.map((f) => {
      let palette = f.palette;
      if (palette) {
        let copy = palettes.get(palette);
        if (!copy) {
          copy = palette.map((c) => [...c] as Rgba);
          palettes.set(palette, copy);
        }
        palette = copy;
      }
      return {
        ...f,
        ...(palette ? { palette } : {}),
        cels: f.cels.map((c) => {
          if (c?.tilemap) {
            let tilemap = tilemaps.get(c.tilemap);
            if (!tilemap) {
              tilemap = { ...c.tilemap, tiles: c.tilemap.tiles.slice() };
              tilemaps.set(c.tilemap, tilemap);
            }
            c = { ...c, tilemap };
          }
          if (!c?.asepriteSamples) return c;
          let asepriteSamples = images.get(c.asepriteSamples);
          if (!asepriteSamples) {
            asepriteSamples = { ...c.asepriteSamples, data: c.asepriteSamples.data.slice() };
            images.set(c.asepriteSamples, asepriteSamples);
          }
          return { ...c, asepriteSamples };
        }),
      };
    }),
  };
}
export function assertAsepriteColorTimeline(t: SpriteTimeline): void {
  if (t.colorDepth !== undefined && ![8, 16, 32].includes(t.colorDepth))
    throw new RangeError("Invalid Aseprite color depth");
  if (
    t.transparentIndex !== undefined &&
    (!Number.isInteger(t.transparentIndex) ||
      t.transparentIndex < 0 ||
      t.transparentIndex > UINT8_MAX)
  )
    throw new RangeError("Invalid indexed transparent color");
  const images = new Set<AsepriteImageSamples>();
  let bytes = 0;
  for (const f of t.frames) {
    if (
      f.palette &&
      (f.palette.length > UINT16_VALUE_COUNT ||
        f.palette.some(
          (c) => c.length !== 4 || c.some((v) => !Number.isInteger(v) || v < 0 || v > UINT8_MAX),
        ))
    )
      throw new RangeError("Invalid frame palette");
    for (const c of f.cels) {
      const image = c?.asepriteSamples;
      if (!image) continue;
      if (
        ![8, 16].includes(image.depth) ||
        image.depth !== t.colorDepth ||
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width > MAX_IMAGE_DIMENSION ||
        image.height > MAX_IMAGE_DIMENSION ||
        !(image.data instanceof Uint8Array) ||
        image.data.length !== image.width * image.height * (image.depth / BITS_PER_BYTE)
      )
        throw new RangeError("Invalid Aseprite cel samples");
      if (!images.has(image)) {
        images.add(image);
        bytes += image.data.byteLength;
        if (bytes > MAX_DOCUMENT_PIXEL_BYTES / 2)
          throw new RangeError("Aseprite cel samples exceed memory limit");
      }
    }
  }
}
/** One writer per committed gesture. Clone Aseprite bytes only on first changed
 * index; old history/source graphs remain immutable even for same-RGBA edits. */
export function createAsepriteIndexWriter(
  doc: EditorDocument,
  preferredIndex: number | undefined,
  fit: "octree" | "bestfit" = "octree",
): AsepriteIndexWriter | undefined {
  if (
    doc.timeline?.colorDepth !== 8 ||
    doc.timeline.layers[doc.timeline.activeLayer]?.kind === "tilemap"
  )
    return undefined;
  let owned: AsepriteImageSamples | undefined;
  let paletteColors: readonly Rgba[] | undefined, paletteCache: AsepritePalette | undefined;
  const getPalette = (colors: readonly Rgba[]) => {
    if (colors !== paletteColors) {
      paletteColors = colors;
      paletteCache = paletteForColors(colors);
    }
    return paletteCache!;
  };
  let projections: { pixels: PixelBuffer; colors: readonly Rgba[]; mask: number }[] = [];
  const mapColor = (color: Rgba, colors: readonly Rgba[], mask: number) =>
    fit === "bestfit"
      ? asepriteBestFit(...color, getPalette(colors), mask)
      : asepriteRgbMap(...color, getPalette(colors), mask);
  const context = () => {
    const t = doc.timeline!,
      f = t.frames[t.activeFrame],
      cel = f.cels[t.activeLayer],
      colors = f.palette ?? doc.palette ?? [],
      mask = t.layers[t.activeLayer].flags & 8 ? -1 : (t.transparentIndex ?? 0);
    return { t, f, cel, colors, mask };
  };
  const read = (x: number, y: number): number | undefined => {
    const { cel, colors, mask } = context(),
      l = doc.layer;
    if (x < 0 || y < 0 || x >= l.pixels.width || y >= l.pixels.height) return undefined;
    const raw = cel?.asepriteSamples;
    if (raw) {
      const ox = x + l.x - cel.x,
        oy = y + l.y - cel.y;
      if (ox >= 0 && oy >= 0 && ox < raw.width && oy < raw.height)
        return raw.data[oy * raw.width + ox];
      return mask >= 0 ? mask : 0;
    }
    const i = (y * l.pixels.width + x) * 4;
    return asepriteBestFit(
      l.pixels.data[i],
      l.pixels.data[i + 1],
      l.pixels.data[i + 2],
      l.pixels.data[i + 3],
      paletteForColors(colors),
      mask,
    );
  };
  return {
    read,
    resolve(_x, _y, color) {
      const { colors, mask } = context();
      const expected =
        preferredIndex !== undefined && preferredIndex >= 0 && preferredIndex < colors.length
          ? preferredIndex === mask
            ? ([0, 0, 0, 0] as Rgba)
            : colors[preferredIndex]
          : undefined;
      const index =
        expected && samePixels(color, expected) && preferredIndex! <= UINT8_MAX
          ? preferredIndex!
          : mapColor(color, colors, mask);
      return index === mask ? [0, 0, 0, 0] : (colors[index] ?? color);
    },
    write(x, y, color, explicitIndex) {
      const { t, cel, colors, mask } = context(),
        l = doc.layer,
        requestedIndex = explicitIndex ?? preferredIndex;
      if (
        requestedIndex !== undefined &&
        (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= colors.length)
      )
        return false;
      const index =
        requestedIndex === undefined
          ? mapColor(color, colors, mask)
          : requestedIndex <= UINT8_MAX
            ? requestedIndex
            : mapColor(colors[requestedIndex], colors, mask);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > UINT8_MAX ||
        index >= colors.length ||
        x < 0 ||
        y < 0 ||
        x >= l.pixels.width ||
        y >= l.pixels.height
      )
        return false;
      const expected: Rgba = index === mask ? [0, 0, 0, 0] : colors[index];
      if (
        explicitIndex === undefined &&
        preferredIndex !== undefined &&
        preferredIndex <= UINT8_MAX &&
        !samePixels(color, expected)
      )
        return false;
      if (read(x, y) === index) return false;
      if (
        !owned ||
        cel?.asepriteSamples !== owned ||
        owned.width !== l.pixels.width ||
        owned.height !== l.pixels.height ||
        cel.x !== l.x ||
        cel.y !== l.y
      ) {
        const previous = cel?.asepriteSamples,
          dx = l.x - (cel?.x ?? l.x),
          dy = l.y - (cel?.y ?? l.y),
          data = new Uint8Array(l.pixels.width * l.pixels.height);
        data.fill(mask >= 0 ? mask : 0);
        if (previous) {
          for (let oy = 0; oy < previous.height; oy++)
            for (let ox = 0; ox < previous.width; ox++) {
              const nx = ox - dx,
                ny = oy - dy;
              if (nx >= 0 && ny >= 0 && nx < l.pixels.width && ny < l.pixels.height)
                data[ny * l.pixels.width + nx] = previous.data[oy * previous.width + ox];
            }
        } else data.set(encodeAsepriteSamples(l.pixels, 8, paletteForColors(colors), mask).data);
        owned = { depth: 8, width: l.pixels.width, height: l.pixels.height, data };
        projections = [];
        const cache = new Map<PixelBuffer, PixelBuffer>();
        const frames = t.frames.map((f, fi) => ({
          ...f,
          cels: f.cels.map((c, li) => {
            if (
              !(fi === t.activeFrame && li === t.activeLayer) &&
              (!previous || c?.asepriteSamples !== previous)
            )
              return c;
            const palette = f.palette ?? doc.palette ?? [],
              celMask = t.layers[li].flags & 8 ? -1 : (t.transparentIndex ?? 0);
            let pixels: PixelBuffer;
            if ((fi === t.activeFrame && li === t.activeLayer) || c?.pixels === cel?.pixels)
              pixels = l.pixels;
            else {
              pixels = c ? cache.get(c.pixels)! : undefined!;
              if (!pixels) {
                pixels = {
                  width: owned!.width,
                  height: owned!.height,
                  data: expandAsepriteSamples(owned!, paletteForColors(palette), celMask),
                };
                if (c) cache.set(c.pixels, pixels);
                projections.push({ pixels, colors: palette, mask: celMask });
              }
            }
            return {
              ...c,
              pixels,
              asepriteSamples: owned,
              x: fi === t.activeFrame && li === t.activeLayer ? l.x : (c?.x ?? 0) + dx,
              y: fi === t.activeFrame && li === t.activeLayer ? l.y : (c?.y ?? 0) + dy,
              opacity: c?.opacity ?? UINT8_MAX,
              zIndex: c?.zIndex ?? 0,
            };
          }),
        }));
        doc.timeline = { ...t, frames };
        doc.layer = { ...l, emptyCel: false };
      }
      owned.data[y * owned.width + x] = index;
      for (const p of projections) {
        const c = index === p.mask ? [0, 0, 0, 0] : (p.colors[index] ?? [0, 0, 0, 0]);
        p.pixels.data.set(c, (y * p.pixels.width + x) * 4);
      }
      return true;
    },
  };
}
/** Index remapping follows .refs/libresprite/src/app/ui/context_bar.cpp's
 * ColorShades::createShadeRemap. */
export function libreSpriteShadingIndex(
  index: number,
  paletteSize: number,
  direction: "left" | "right",
  ramp: readonly number[] = [],
): number {
  if (ramp.length <= 1)
    return (
      (direction === "left"
        ? Math.max(0, index - 1)
        : index < paletteSize - 1
          ? index + 1
          : index) & UINT8_MAX
    );
  let result = index;
  if (direction === "left") {
    for (let i = 1; i < ramp.length; i++)
      if (ramp[i] === index && index >= 0 && index < paletteSize) result = ramp[i - 1];
  } else {
    for (let i = 0; i < ramp.length - 1; i++)
      if (ramp[i] === index && index >= 0 && index < paletteSize) result = ramp[i + 1];
  }
  return result & UINT8_MAX;
}
/** Shading reads original indexed samples, not an RGBA color match. An empty
 * or one-color ramp traverses the whole palette; opacity is ignored upstream. */
export function createIndexedShadingWriter(
  doc: EditorDocument,
  direction: "left" | "right",
  shade: readonly Rgba[] = [],
  shadeIndices: readonly number[] = [],
): AsepriteIndexWriter | undefined {
  const base = createAsepriteIndexWriter(doc, undefined);
  if (!base) return undefined;
  const original = new Map<string, number>(),
    pending = new Map<string, number>();
  const colors = doc.timeline?.frames[doc.timeline.activeFrame].palette ?? doc.palette ?? [],
    ramp = shade.map((color, i) =>
      shadeIndices[i] >= 0 && shadeIndices[i] <= UINT8_MAX
        ? shadeIndices[i]
        : (libreSpriteWorkingBrushIndex(color, doc.timeline, colors) ?? 0),
    );
  const key = (x: number, y: number) => `${x + doc.layer.x},${y + doc.layer.y}`;
  const next = (x: number, y: number) => {
    const k = key(x, y);
    let index = original.get(k);
    if (index === undefined) {
      index = base.read(x, y);
      if (index === undefined) return;
      original.set(k, index);
    }
    const mapped = libreSpriteShadingIndex(
      index,
      Math.min(UINT8_MAX + 1, colors.length),
      direction,
      ramp,
    );
    pending.set(k, mapped);
    return mapped;
  };
  return {
    read: base.read,
    resolve(x, y, color) {
      const index = next(x, y);
      if (index === undefined) return color;
      return index === (doc.timeline?.transparentIndex ?? 0) &&
        !(doc.timeline!.layers[doc.timeline!.activeLayer].flags & 8)
        ? [0, 0, 0, 0]
        : (colors[index] ?? color);
    },
    write(x, y, color, explicitIndex) {
      const index = explicitIndex ?? pending.get(key(x, y)) ?? next(x, y);
      return index === undefined ? false : base.write(x, y, color, index);
    },
  };
}
