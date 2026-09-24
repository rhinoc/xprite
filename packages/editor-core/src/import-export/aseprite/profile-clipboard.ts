import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { cloneClipboardColorProfile, type ClipboardImage } from "$/clipboard/image";
import { cloneClipboardTileset } from "$/clipboard/tile";
import type { TimelineClipboard } from "$/clipboard/timeline";
import {
  workingColorProfile,
  colorProfilesEquivalent,
  convertPixelsBetweenProfiles,
} from "$/color/icc-profile";
import {
  encodeAsepriteSamples,
  expandAsepriteSamples,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
import type { EditorDocument } from "$/document/types";
import type { AsepriteTileset } from "$/import-export/aseprite/model";
import { asepriteFromProject, type AsepriteEditorProject } from "$/import-export/aseprite/project";
import {
  canKeepSelectionAsepriteSamples,
  transformCorners,
  type SelectionTransform,
} from "$/selection/transform";

function convertPalette(
  palette: readonly Rgba[] | undefined,
  from: ClipboardImage["sourceProfile"],
  to: ClipboardImage["sourceProfile"],
): readonly Rgba[] | undefined {
  if (!palette?.length) return palette;
  const data = new Uint8ClampedArray(palette.length * 4);
  palette.forEach((c, i) => data.set(c, i * 4));
  const input = { width: palette.length, height: 1, data },
    output = convertPixelsBetweenProfiles(input, from, to);
  return output === input
    ? palette
    : palette.map((_, i) => output.data.slice(i * 4, i * 4 + 4) as unknown as Rgba);
}
function prepareTileset(
  set: AsepriteTileset,
  from: ClipboardImage["sourceProfile"],
  doc: EditorDocument | undefined,
  sourcePalette?: readonly Rgba[],
  sourceMask = 0,
  destinationPalette?: readonly Rgba[],
): AsepriteTileset {
  const target = workingColorProfile(doc?.timeline),
    depth = doc?.timeline?.colorDepth ?? 32,
    maskIndex = doc?.timeline?.transparentIndex ?? 0;
  const owned = cloneClipboardTileset(set),
    width = set.tileWidth,
    height = set.tileHeight * set.tileCount,
    stride = set.asepritePixels ? set.asepritePixels.length / (width * height) : 0;
  if (stride && stride !== 1 && stride !== 2) throw new Error("Invalid Aseprite tileset samples");
  const original: AsepriteImageSamples | undefined = set.asepritePixels
    ? { width, height, depth: stride === 1 ? 8 : 16, data: set.asepritePixels }
    : undefined;
  let image = {
    width,
    height,
    data: original
      ? expandAsepriteSamples(original, paletteForColors(sourcePalette), sourceMask)
      : new Uint8ClampedArray(set.pixels),
  };
  image = convertPixelsBetweenProfiles(image, from, target);
  if (depth === 8 || depth === 16) {
    const palette = paletteForColors(
        destinationPalette ??
          doc?.timeline?.frames[doc.timeline.activeFrame].palette ??
          doc?.palette,
      ),
      previous =
        original?.depth === depth && colorProfilesEquivalent(from, target) ? original : undefined,
      samples = encodeAsepriteSamples(image, depth, palette, maskIndex, previous);
    owned.asepritePixels = samples.data.slice();
    owned.pixels = new Uint8Array(expandAsepriteSamples(samples, palette, maskIndex));
  } else {
    owned.asepritePixels = undefined;
    owned.pixels = new Uint8Array(image.data);
  }
  return owned;
}
/** Source profile defaults to sRGB. Numerical working pixels remain exact for
 * same-profile paste; the Aseprite target mode is normalized after committing. */
export function prepareImageClipboardForDocument(
  payload: ClipboardImage,
  doc?: EditorDocument,
): ClipboardImage {
  const target = workingColorProfile(doc?.timeline),
    depth = doc?.timeline?.colorDepth ?? 32;
  let pixels = convertPixelsBetweenProfiles(payload.pixels, payload.sourceProfile, target),
    asepriteSamples: AsepriteImageSamples | undefined;
  if (doc && (depth === 8 || depth === 16)) {
    const colors = doc.timeline?.frames[doc.timeline.activeFrame].palette ?? doc.palette,
      maskIndex = doc.timeline?.transparentIndex ?? 0;
    asepriteSamples = encodeAsepriteSamples(
      pixels,
      depth,
      paletteForColors(colors),
      maskIndex,
      payload.asepriteSamples?.depth === depth ? payload.asepriteSamples : undefined,
    );
    const data = expandAsepriteSamples(asepriteSamples, paletteForColors(colors), maskIndex);
    pixels = { ...pixels, data };
  }
  const tilemap = payload.tilemap
    ? {
        ...payload.tilemap,
        tileset: prepareTileset(
          payload.tilemap.tileset,
          payload.sourceProfile,
          doc,
          payload.palette,
          payload.transparentIndex ?? 0,
        ),
      }
    : undefined;
  return {
    ...payload,
    tilemap,
    pixels,
    asepriteSamples,
    transparentIndex: doc?.timeline?.transparentIndex,
    sourceBackground: false,
    palette: convertPalette(payload.palette, payload.sourceProfile, target),
    sourceProfile: cloneClipboardColorProfile(target),
  };
}
/** Frame paste carries its palettes. Layer/cel paste keeps destination palettes
 * and remaps samples, preventing existing target cels from being recolored. */
export function prepareTimelineClipboardForDocument(
  payload: TimelineClipboard,
  doc: EditorDocument,
): TimelineClipboard {
  const t = doc.timeline;
  if (!t) return payload;
  const target = workingColorProfile(t),
    depth = t.colorDepth ?? 32,
    maskIndex = t.transparentIndex ?? 0;
  const converted = new Map<PixelBuffer, PixelBuffer>(),
    rawLinks = new Map<string, AsepriteImageSamples>(),
    imageIds = new Map<object, number>();
  let sequence = 0;
  const identity = (o: object) => {
    let id = imageIds.get(o);
    if (id === undefined) {
      id = sequence++;
      imageIds.set(o, id);
    }
    return id;
  };
  const frames = payload.frames.map((frame, fi) => {
    const destination =
      t.frames[payload.kind === "layers" ? fi : t.activeFrame + fi] ?? t.frames[t.activeFrame];
    let palette =
      payload.kind === "frames"
        ? convertPalette(frame.palette, payload.sourceProfile, target)
        : (destination?.palette ?? doc.palette);
    if (!palette) palette = doc.palette;
    if (
      depth === 8 &&
      payload.kind === "frames" &&
      payload.colorDepth === 8 &&
      (payload.transparentIndex ?? 0) !== maskIndex &&
      palette
    ) {
      const colors = [...palette],
        sourceMask = payload.transparentIndex ?? 0;
      while (colors.length <= Math.max(sourceMask, maskIndex)) colors.push([0, 0, 0, UINT8_MAX]);
      [colors[sourceMask], colors[maskIndex]] = [colors[maskIndex], colors[sourceMask]];
      palette = colors;
    }
    const cels = frame.cels.map((cel, li) => {
      if (!cel) return null;
      let pixels = converted.get(cel.pixels);
      if (!pixels) {
        pixels = convertPixelsBetweenProfiles(cel.pixels, payload.sourceProfile, target);
        converted.set(cel.pixels, pixels);
      }
      if (depth === 32) return { ...cel, pixels, asepriteSamples: undefined };
      const background =
        payload.kind === "layers"
          ? !!(payload.layers[li].flags & 8)
          : !!(
              t.layers[
                payload.kind === "frames"
                  ? t.layers.length - payload.layers.length + li
                  : t.activeLayer - payload.layers.length + 1 + li
              ]?.flags & 8
            );
      const paletteObject = paletteForColors(palette),
        asepriteSamples = encodeAsepriteSamples(
          pixels,
          depth,
          paletteObject,
          background ? -1 : maskIndex,
          cel.asepriteSamples?.depth === depth ? cel.asepriteSamples : undefined,
        );
      // Preserve copied links only when destination palettes yield equal sample bytes.
      const key =
        identity(cel.asepriteSamples ?? cel.pixels) +
        ":" +
        depth +
        ":" +
        asepriteSamples.width +
        ":" +
        asepriteSamples.height;
      const previous = rawLinks.get(key);
      let samples = asepriteSamples;
      if (
        previous &&
        previous.data.length === asepriteSamples.data.length &&
        previous.data.every((v, i) => v === asepriteSamples.data[i])
      )
        samples = previous;
      else rawLinks.set(key, asepriteSamples);
      return {
        ...cel,
        pixels: {
          width: samples.width,
          height: samples.height,
          data: expandAsepriteSamples(samples, paletteObject, background ? -1 : maskIndex),
        },
        asepriteSamples: samples,
      };
    });
    return { ...frame, palette, cels };
  });
  const tilesets = payload.tilesets?.map((set) => {
    const used = payload.frames.flatMap((f, fi) =>
      f.cels.some((c, li) => c?.tilemap && payload.layers[li].tilesetId === set.id) ? [fi] : [],
    );
    let result: AsepriteTileset | undefined;
    for (const fi of used.length ? used : [0]) {
      const converted = prepareTileset(
        set,
        payload.sourceProfile,
        doc,
        payload.frames[fi]?.palette,
        payload.transparentIndex ?? 0,
        frames[fi]?.palette,
      );
      if (result) {
        const a = result.asepritePixels ?? result.pixels,
          b = converted.asepritePixels ?? converted.pixels;
        if (a.length !== b.length || a.some((v, i) => v !== b[i]))
          throw new Error(
            "This shared Tileset needs different tile samples in different frame palettes. Paste one frame at a time.",
          );
      } else result = converted;
    }
    return result!;
  });
  return {
    ...payload,
    tilesets,
    colorDepth: depth,
    transparentIndex: maskIndex,
    sourceProfile: cloneClipboardColorProfile(target),
    frames,
  };
}

/** New sprite inherits Aseprite sample mode and working profile, not an implicit
 * flattened sRGB conversion. The workspace installs this as an unsaved project. */
export function projectFromClipboardImage(payload: ClipboardImage): AsepriteEditorProject {
  const pixels = { ...payload.pixels, data: payload.pixels.data.slice() },
    asepriteSamples = payload.asepriteSamples
      ? { ...payload.asepriteSamples, data: payload.asepriteSamples.data.slice() }
      : undefined,
    palette = payload.palette?.map((c) => [...c] as Rgba),
    background = !!payload.sourceBackground;
  const timeline: AsepriteEditorProject["timeline"] = {
    colorDepth: asepriteSamples?.depth ?? 32,
    transparentIndex: payload.transparentIndex ?? 0,
    composeGroups: false,
    activeFrame: 0,
    activeLayer: 0,
    layers: [
      {
        id: "layer-1",
        name: background ? "Background" : "Layer 1",
        kind: "image",
        visible: true,
        locked: false,
        opacity: UINT8_MAX,
        flags: background ? 15 : 3,
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
  if (payload.tilemap) {
    const value = payload.tilemap,
      set = cloneClipboardTileset(value.tileset);
    timeline.tilesets = [set];
    if (set.asepritePixels) {
      const stride = set.asepritePixels.length / (set.tileWidth * set.tileHeight * set.tileCount);
      if (stride !== 1 && stride !== 2) throw new Error("Invalid Aseprite tileset samples");
      timeline.colorDepth = stride === 1 ? 8 : 16;
    }
    timeline.layers = [{ ...timeline.layers[0], kind: "tilemap", tilesetId: set.id, flags: 3 }];
    timeline.frames = [
      {
        ...timeline.frames[0],
        cels: [
          {
            pixels,
            x: 0,
            y: 0,
            opacity: UINT8_MAX,
            zIndex: 0,
            tilemap: { ...value.map, tiles: value.map.tiles.slice() },
          },
        ],
      },
    ];
  }
  const project = { image: pixels, timeline, palette };
  if (payload.sourceProfile) {
    timeline.asepriteSource = asepriteFromProject(project, { preserveGroupMetadata: true });
    timeline.asepriteSource.colorProfile = cloneClipboardColorProfile(payload.sourceProfile);
  }
  return project;
}
/** Match rasterizeSelectionTransform's nearest-neighbor sampling directly on
 * Aseprite sample bytes; no color-to-index guessing or giant temporary RGBA index image. */
export function transformClipboardAsepriteSamples(
  source: AsepriteImageSamples,
  transform: SelectionTransform,
  transparentIndex = 0,
): AsepriteImageSamples | undefined {
  if (!canKeepSelectionAsepriteSamples(transform)) return undefined;
  const corners = transformCorners(transform.bounds, transform.angle),
    xs = corners.map((p) => p.x),
    ys = corners.map((p) => p.y),
    x = Math.floor(Math.min(...xs) + 1e-8),
    y = Math.floor(Math.min(...ys) + 1e-8),
    width = Math.max(1, Math.ceil(Math.max(...xs) - 1e-8) - x),
    height = Math.max(1, Math.ceil(Math.max(...ys) - 1e-8) - y);
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  const stride = source.depth / BITS_PER_BYTE,
    data = new Uint8Array(width * height * stride);
  if (source.depth === 8) data.fill(transparentIndex);
  if (!transform.bounds.width || !transform.bounds.height)
    return { depth: source.depth, width, height, data };
  const cx = transform.bounds.x + transform.bounds.width / 2,
    cy = transform.bounds.y + transform.bounds.height / 2,
    c = Math.cos(transform.angle),
    s = Math.sin(transform.angle);
  for (let oy = 0; oy < height; oy++)
    for (let ox = 0; ox < width; ox++) {
      const dx = x + ox + 0.5 - cx,
        dy = y + oy + 0.5 - cy,
        sx = Math.floor(((dx * c + dy * s) / transform.bounds.width + 0.5) * source.width),
        sy = Math.floor(((-dx * s + dy * c) / transform.bounds.height + 0.5) * source.height);
      if (
        sx < 0 ||
        sy < 0 ||
        sx >= source.width ||
        sy >= source.height ||
        !transform.mask.data[sy * source.width + sx]
      )
        continue;
      const from = (sy * source.width + sx) * stride;
      data.set(source.data.subarray(from, from + stride), (oy * width + ox) * stride);
    }
  return { depth: source.depth, width, height, data };
}
