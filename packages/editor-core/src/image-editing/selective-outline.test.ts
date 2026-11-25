import { describe, expect, it } from "vitest";

import type { PixelBuffer, Rgba } from "$/base";
import { expandAsepriteSamples, paletteForColors, rgbToLab } from "$/color";
import { activateTimelineCel, type EditorDocument } from "$/document";
import { RasterEditor } from "$/editor/RasterEditor";
import {
  applyDocumentEffect,
  applyEffectPixels,
  defaultEffect,
  EffectKind,
  EffectTarget,
  OutlineColorMode,
  OUTLINE_MATRICES,
  type EffectSpec,
} from "$/image-editing/effects";

const clear: Rgba = [0, 0, 0, 0];
const black: Rgba = [0, 0, 0, 255];
const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const white: Rgba = [255, 255, 255, 255];
const image = (pixels: readonly Rgba[], width = pixels.length): PixelBuffer => ({
  width,
  height: pixels.length / width,
  data: new Uint8ClampedArray(pixels.flat()),
});
const pixel = (source: PixelBuffer, x: number, y = 0): Rgba => {
  const at = (y * source.width + x) * 4;
  return [source.data[at], source.data[at + 1], source.data[at + 2], source.data[at + 3]];
};
const lightness = ([r, g, b]: Rgba) => rgbToLab(r, g, b)[0];
const selective = {
  kind: EffectKind.Outline,
  colorMode: OutlineColorMode.Selective,
  color: white,
  bgColor: clear,
  place: "outside",
  matrix: OUTLINE_MATRICES.circle,
} satisfies EffectSpec;

function indexedDocument(
  palette: readonly Rgba[],
  indices: number[],
  transparentIndex = 0,
): EditorDocument {
  const samples = {
    depth: 8 as const,
    width: indices.length,
    height: 1,
    data: new Uint8Array(indices),
  };
  const pixels = {
    width: samples.width,
    height: samples.height,
    data: expandAsepriteSamples(samples, paletteForColors(palette), transparentIndex),
  };
  const doc = new RasterEditor(pixels).getSnapshot().document!;
  const timeline = doc.timeline!;
  const frame = timeline.frames[0];
  doc.palette = palette;
  doc.timeline = {
    ...timeline,
    colorDepth: 8,
    transparentIndex,
    frames: [
      { ...frame, palette, cels: [{ ...frame.cels[0]!, pixels, asepriteSamples: samples }] },
    ],
  };
  activateTimelineCel(doc, 0, 0);
  return doc;
}

const celIndices = (doc: EditorDocument, frame = 0) =>
  Array.from(doc.timeline!.frames[frame].cels[0]!.asepriteSamples!.data);

describe("selective outline", () => {
  it("uses the foreground for Solid and keeps an omitted color mode equivalent", () => {
    const source = image([clear, red, clear]);
    const spec = defaultEffect(EffectKind.Outline, blue, white);
    if (spec.kind !== EffectKind.Outline) throw new Error("Expected the outline default");
    expect(spec.colorMode).toBe(OutlineColorMode.Solid);
    expect(applyEffectPixels(source, spec)).toEqual(image([blue, red, blue]));
    expect(applyEffectPixels(source, { ...spec, colorMode: undefined })).toEqual(
      applyEffectPixels(source, spec),
    );
    const indexed = indexedDocument([clear, red, blue], [0, 1, 0]);
    expect(celIndices(applyDocumentEffect(indexed, spec))).toEqual([2, 1, 2]);
    expect(celIndices(applyDocumentEffect(indexed, { ...spec, colorMode: undefined }))).toEqual([
      2, 1, 2,
    ]);
  });

  it("shades each outside pixel from its own neighbors, including multicolor seams", () => {
    const source = image([clear, red, clear, blue, clear]);
    const outlined = applyEffectPixels(source, selective);
    const [redEdge, seam, blueEdge] = [pixel(outlined, 0), pixel(outlined, 2), pixel(outlined, 4)];
    expect(redEdge[0]).toBeGreaterThan(redEdge[2]);
    expect(blueEdge[2]).toBeGreaterThan(blueEdge[0]);
    expect(seam[0]).toBeGreaterThan(0);
    expect(seam[2]).toBeGreaterThan(0);
    expect(lightness(redEdge)).toBeLessThan(lightness(red));
    expect(lightness(blueEdge)).toBeLessThan(lightness(blue));
    expect([redEdge[3], seam[3], blueEdge[3]]).toEqual([255, 255, 255]);
    expect(pixel(outlined, 1)).toEqual(red);
    expect(pixel(outlined, 3)).toEqual(blue);
    expect(source).toEqual(image([clear, red, clear, blue, clear]));
    expect(pixel(applyEffectPixels(source, { ...selective, darkening: 100 }), 2)).toEqual(black);
  });

  it("darkens only inside edges, including an isolated pixel and edges next to lighter colors", () => {
    const source = image([clear, blue, white, white, clear, red, clear]);
    const spec = { ...selective, place: "inside" } as const;
    const outlined = applyEffectPixels(source, spec);
    expect(pixel(outlined, 0)).toEqual(clear);
    expect(lightness(pixel(outlined, 1))).toBeLessThan(lightness(blue));
    expect(pixel(outlined, 2)).toEqual(white);
    expect(lightness(pixel(outlined, 3))).toBeLessThan(lightness(white));
    expect(pixel(outlined, 5)).toEqual(pixel(applyEffectPixels(image([red, clear]), spec), 0));
  });

  it.each([
    ["circle", [7, 11, 13, 17]],
    ["square", [6, 7, 8, 11, 13, 16, 17, 18]],
    ["horizontal", [11, 13]],
    ["vertical", [7, 17]],
  ] as const)("uses the %s matrix for placement", (matrix, edgePixels) => {
    const source = image(
      Array.from({ length: 25 }, (_, index) => (index === 12 ? red : clear)),
      5,
    );
    const result = applyEffectPixels(source, { ...selective, matrix: OUTLINE_MATRICES[matrix] });
    const painted = Array.from({ length: 25 }, (_, index) => index).filter(
      (index) => source.data[index * 4 + 3] === 0 && result.data[index * 4 + 3] === 255,
    );
    expect(painted).toEqual(edgePixels);
  });

  it.each([0, 1, 2, 3] as const)("wraps selective samples on the chosen axes (%i)", (tiledMode) => {
    const source = image([red, ...Array<Rgba>(15).fill(clear)], 4);
    const result = applyEffectPixels(source, {
      ...selective,
      matrix: OUTLINE_MATRICES.square,
      tiledMode,
    });
    const shade = pixel(result, 1, 0);
    expect(pixel(result, 3, 0)).toEqual(tiledMode & 1 ? shade : clear);
    expect(pixel(result, 0, 3)).toEqual(tiledMode & 2 ? shade : clear);
    expect(pixel(result, 3, 3)).toEqual(tiledMode === 3 ? shade : clear);
  });

  it("reads outside the selection, ignores background color, and prefers fully opaque samples", () => {
    const background: Rgba = [200, 200, 200, 255];
    const translucentBlue: Rgba = [0, 0, 255, 120];
    const source = image([red, background, translucentBlue, clear]);
    const result = applyEffectPixels(
      source,
      { ...selective, bgColor: background },
      { x: 1, y: 0, width: 1, height: 1, data: new Uint8Array([1]) },
    );
    expect(pixel(result, 1)).toEqual(pixel(applyEffectPixels(image([red, clear]), selective), 1));
    expect(pixel(result, 2)).toEqual(translucentBlue);
    expect(pixel(result, 3)).toEqual(clear);
    expect(pixel(applyEffectPixels(source, selective), 3)[3]).toBe(255);
  });

  it("writes darker opaque palette indices and ignores an opaque transparent-index entry", () => {
    const palette: Rgba[] = [
      [125, 0, 0, 255],
      red,
      [180, 0, 0, 120],
      [180, 0, 0, 255],
      [0, 0, 100, 255],
      blue,
      red,
    ];
    const doc = indexedDocument(palette, [3, 6, 3, 3, 3, 5, 3], 3);
    const result = applyDocumentEffect(doc, selective);
    expect(celIndices(result)).toEqual([0, 6, 0, 3, 4, 5, 4]);
    expect(pixel(result.layer.pixels, 0)).toEqual(palette[0]);
    expect(pixel(result.layer.pixels, 6)).toEqual(palette[4]);
    expect(result.palette).toBe(palette);
    expect(celIndices(doc)).toEqual([3, 6, 3, 3, 3, 5, 3]);
  });

  it("matches Indexed inside outlines with tiled reads and uses each frame's palette", () => {
    const darkRed: Rgba = [125, 0, 0, 255];
    const darkBlue: Rgba = [0, 0, 125, 255];
    const doc = indexedDocument([clear, red, darkRed, darkBlue], [1, 1, 0]);
    const nextFrame = indexedDocument([clear, blue, darkRed, darkBlue], [1, 1, 0]).timeline!
      .frames[0];
    doc.timeline!.frames = [...doc.timeline!.frames, nextFrame];
    const spec = { ...selective, place: "inside", matrix: OUTLINE_MATRICES.horizontal } as const;
    const untiled = applyDocumentEffect(doc, spec);
    expect(celIndices(untiled)).toEqual([1, 2]);
    const tiled = applyDocumentEffect(doc, { ...spec, tiledMode: 1 }, EffectTarget.All);
    expect(celIndices(tiled)).toEqual([2, 2]);
    expect(celIndices(tiled, 1)).toEqual([3, 3]);
  });

  it("uses darkening strength to choose among darker palette entries", () => {
    const palette: Rgba[] = [clear, red, [220, 0, 0, 255], [100, 0, 0, 255]];
    const doc = indexedDocument(palette, [0, 1, 0]);
    expect(celIndices(applyDocumentEffect(doc, { ...selective, darkening: 1 }))).toEqual([2, 1, 2]);
    expect(celIndices(applyDocumentEffect(doc, { ...selective, darkening: 70 }))).toEqual([
      3, 1, 3,
    ]);
  });

  it("uses the darkest available palette entry as a fallback and requires an opaque entry", () => {
    const oneShade = indexedDocument([clear, red], [0, 1, 0]);
    expect(celIndices(applyDocumentEffect(oneShade, selective))).toEqual([1, 1, 1]);
    const translucentOnly = indexedDocument([clear, [255, 0, 0, 120]], [0, 1, 0]);
    expect(applyDocumentEffect(translucentOnly, selective)).toBe(translucentOnly);
  });

  it.each([32, 8] as const)("isolates depth-%i preview from saved pixels and undo", (depth) => {
    const editor = new RasterEditor(image([clear, red, clear]));
    if (depth === 8) editor.imageEditing.convertColorMode(depth, { palette: [clear, red, black] });
    editor.history.markSaved();
    const before = editor.getPersistenceSnapshot();
    const history = editor.history.getSnapshot();
    editor.imageEditing.previewEffect(selective);
    const draft = editor.imageEditing.getEffectPreview()!;
    expect(pixel(draft.layer.pixels, 0)[3]).toBe(255);
    expect(editor.getPersistenceSnapshot()).toEqual(before);
    expect(editor.history.getSnapshot()).toEqual(history);
    editor.imageEditing.previewEffect(null);
    expect(editor.imageEditing.getEffectPreview()).toBeNull();
    editor.imageEditing.applyEffect(selective);
    expect(editor.getSnapshot().document!.layer.pixels).toEqual(draft.layer.pixels);
    expect(editor.getSnapshot().dirty).toBe(true);
    editor.history.undo();
    expect(editor.getPersistenceSnapshot()).toEqual(before);
  });
});
