import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { PixelBuffer, Rect } from "$/base/primitives";
import { BLEND_MODES } from "$/canvas/blend-modes";
import { workingColorProfile, convertPixelsToSrgb } from "$/color/icc-profile";
import type { EditorDocument } from "$/document/types";
import { AsepriteTagDirection } from "$/import-export/aseprite/model";
import {
  exportFrameOrder,
  renderExportAnimation,
  type ExportAnimationFrame,
} from "$/import-export/image/export-animation";
import { exportGeometry, type ExportFileOptions } from "$/import-export/image/export-plan";
import { packAsepriteSheetRects } from "$/import-export/image/sheet-packing";
import { sliceMetadataForExport } from "$/sprite/slice-metadata";
import { timelineTags } from "$/timeline/operations/timeline-range";
import { effectiveLayerVisible, layerAncestors } from "$/timeline/timeline";
export enum SheetLayout {
  Horizontal = "horizontal",
  Vertical = "vertical",
  Rows = "rows",
  Columns = "columns",
  Packed = "packed",
}
export interface SpriteSheetOptions extends ExportFileOptions {
  source?: "sprite" | "tilesets";
  layout: SheetLayout;
  constraint: "none" | "columns" | "rows" | "width" | "height" | "size";
  constraintWidth: number;
  constraintHeight: number;
  borderPadding: number;
  shapePadding: number;
  innerPadding: number;
  trimSprite: boolean;
  trimCels: boolean;
  trimByGrid?: boolean;
  extrude: boolean;
  mergeDuplicates: boolean;
  powerOfTwo: boolean;
  splitLayers: boolean;
  splitTags: boolean;
  dataName: string;
  dataFormat: "hash" | "array";
  imageEnabled: boolean;
  dataEnabled: boolean;
  listLayers: boolean;
  listTags: boolean;
  listSlices?: boolean;
  filenameFormat: string;
  tagnameFormat?: string;
  openGenerated: boolean;
}
export function defaultSpriteSheetOptions(doc: EditorDocument): SpriteSheetOptions {
  const title = doc.name.replace(/\.[^.]*$/, "");
  return {
    source: "sprite",
    name: `${title}.png`,
    dataName: `${title}.json`,
    scalePercent: 100,
    area: "canvas",
    layers: "visible",
    frame: doc.timeline?.activeFrame ?? 0,
    frames: "all",
    direction: AsepriteTagDirection.Forward,
    layout: SheetLayout.Rows,
    constraint: "none",
    constraintWidth: 1,
    constraintHeight: 1,
    borderPadding: 0,
    shapePadding: 0,
    innerPadding: 0,
    trimSprite: false,
    trimCels: false,
    trimByGrid: false,
    tagnameFormat: "{tag}",
    extrude: false,
    mergeDuplicates: false,
    powerOfTwo: false,
    splitLayers: false,
    splitTags: false,
    dataFormat: "hash",
    imageEnabled: false,
    dataEnabled: false,
    listLayers: true,
    listTags: true,
    listSlices: true,
    filenameFormat: "{title} {frame}.{extension}",
    openGenerated: false,
  };
}
export interface SheetFrameData {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}
export interface SpriteSheetResult {
  pixels: PixelBuffer;
  data: {
    frames: SheetFrameData[] | Record<string, Omit<SheetFrameData, "filename">>;
    meta: Record<string, unknown>;
  };
  samples: readonly SheetFrameData[];
}
const transparentBounds = (p: PixelBuffer): Rect => {
  let left = p.width,
    top = p.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      if (p.data[(y * p.width + x) * 4 + 3]) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
  return right
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : { x: 0, y: 0, width: 1, height: 1 };
};
const union = (a: Rect, b: Rect): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
  height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
});
const nextPower = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));
interface Sample extends ExportAnimationFrame {
  outputFrame: number;
  bounds: Rect;
  layer: string;
  tag: string;
  tilesetId?: number;
  tileIndex?: number;
  duplicate?: number;
  slot?: Rect;
}
function layoutSamples(
  samples: Sample[],
  o: SpriteSheetOptions,
): { width: number; height: number } {
  const extra = 2 * (o.innerPadding + (o.extrude ? 1 : 0)),
    gap = o.shapePadding,
    border = o.borderPadding;
  const distinct = samples.filter((s) => s.duplicate === undefined),
    sizes = distinct.map((s) => ({
      x: 0,
      y: 0,
      width: s.bounds.width + extra + gap,
      height: s.bounds.height + extra + gap,
    }));
  let width = 0,
    height = 0,
    slots: Rect[];
  if (o.layout === SheetLayout.Packed) {
    const packed = packAsepriteSheetRects(
      sizes.map((size) => ({ width: size.width - gap, height: size.height - gap })),
      border,
      gap,
      o.constraint === "width" || o.constraint === "size" ? o.constraintWidth : 0,
      o.constraint === "height" || o.constraint === "size" ? o.constraintHeight : 0,
    );
    width = packed.width;
    height = packed.height;
    slots = packed.rects.map((r) => ({
      ...r,
      x: r.x - border,
      y: r.y - border,
      width: r.width + gap,
      height: r.height + gap,
    }));
  } else {
    // Direct SimpleLayoutSamples progression: variable trimmed dimensions,
    // one band per source/layer/tag unless an explicit limit wraps the band.
    const vertical = o.layout === SheetLayout.Vertical || o.layout === SheetLayout.Columns,
      bands = o.layout === SheetLayout.Rows || o.layout === SheetLayout.Columns;
    const limitWidth =
      o.constraint === "width" || o.constraint === "size" ? o.constraintWidth - border * 2 : 0;
    const limitHeight =
      o.constraint === "height" || o.constraint === "size" ? o.constraintHeight - border * 2 : 0;
    const perBand = vertical
      ? o.constraint === "rows"
        ? o.constraintHeight
        : -1
      : o.constraint === "columns"
        ? o.constraintWidth
        : -1;
    let x = 0,
      y = 0,
      bandWidth = 0,
      bandHeight = 0,
      inBand = 0;
    let previous: Sample | undefined;
    slots = [];
    for (let i = 0; i < distinct.length; i++) {
      const sample = distinct[i],
        size = sizes[i],
        w = size.width - gap,
        h = size.height - gap;
      if (bands && previous) {
        const changed =
          (o.splitLayers && previous.layer !== sample.layer) ||
          (o.splitTags && previous.tag !== sample.tag) ||
          inBand === perBand;
        const wrap = vertical
          ? limitHeight
            ? y + h > limitHeight
            : changed
          : limitWidth
            ? x + w > limitWidth
            : changed;
        if (wrap) {
          if (vertical) {
            x += bandWidth + gap;
            y = 0;
          } else {
            x = 0;
            y += bandHeight + gap;
          }
          bandWidth = 0;
          bandHeight = 0;
          inBand = 0;
        }
      }
      slots.push({ ...size, x, y });
      if (vertical) y += h + gap;
      else x += w + gap;
      bandWidth = Math.max(bandWidth, w);
      bandHeight = Math.max(bandHeight, h);
      inBand++;
      previous = sample;
    }
  }
  width = Math.max(...slots.map((r) => r.x + r.width)) - gap + border * 2;
  height = Math.max(...slots.map((r) => r.y + r.height)) - gap + border * 2;
  if (o.constraint === "width" || o.constraint === "size") {
    if (width > o.constraintWidth) throw new Error("Sheet width exceeds constraint.");
    width = o.constraintWidth;
  }
  if (o.constraint === "height" || o.constraint === "size") {
    if (height > o.constraintHeight) throw new Error("Sheet height exceeds constraint.");
    height = o.constraintHeight;
  }
  if (o.powerOfTwo) {
    width = nextPower(width);
    height = nextPower(height);
  }
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new RangeError("Sprite sheet dimensions exceed the image limit.");
  distinct.forEach(
    (s, i) => (s.slot = { ...slots[i], x: slots[i].x + border, y: slots[i].y + border }),
  );
  samples.forEach((s) => {
    if (s.duplicate !== undefined) s.slot = samples[s.duplicate].slot;
  });
  return { width, height };
}
export function renderSpriteSheet(doc: EditorDocument, o: SpriteSheetOptions): SpriteSheetResult {
  if (
    !/\.png$/i.test(o.name) ||
    ![
      SheetLayout.Horizontal,
      SheetLayout.Vertical,
      SheetLayout.Rows,
      SheetLayout.Columns,
      SheetLayout.Packed,
    ].includes(o.layout)
  )
    throw new Error("Sprite sheet output must be a PNG image.");
  for (const n of [o.borderPadding, o.shapePadding, o.innerPadding])
    if (!Number.isInteger(n) || n < 0 || n > 4096)
      throw new RangeError("Invalid sprite sheet padding.");
  for (const n of [o.constraintWidth, o.constraintHeight])
    if (!Number.isInteger(n) || n < 1 || n > MAX_IMAGE_DIMENSION)
      throw new RangeError("Invalid sheet constraints.");
  const timeline = doc.timeline,
    tags = timeline ? timelineTags(timeline) : [];
  const roots =
    o.splitLayers && timeline
      ? timeline.layers.flatMap((l, i) =>
          l.kind !== "group" &&
          !(l.flags & 64) &&
          (o.layers === "selected"
            ? (timeline.range?.layers ?? [timeline.activeLayer]).some(
                (j) =>
                  j === i ||
                  layerAncestors(timeline, i).some((p) => p.id === timeline.layers[j].id),
              )
            : effectiveLayerVisible(timeline, i))
            ? [i]
            : [],
        )
      : [undefined];
  const samples: Sample[] = [];
  let samplePixels = 0;
  if (o.source === "tilesets") {
    if (!Number.isFinite(o.scalePercent) || o.scalePercent <= 0)
      throw new RangeError("Invalid export resize.");
    const selected = timeline?.range?.layers ?? [timeline?.activeLayer ?? 0];
    const ids = new Set(
      timeline?.layers.flatMap((layer, i) =>
        layer.kind === "tilemap" &&
        layer.tilesetId !== undefined &&
        (o.layers === "selected"
          ? selected.some(
              (j) =>
                j === i ||
                layerAncestors(timeline, i).some((parent) => parent.id === timeline.layers[j]?.id),
            )
          : effectiveLayerVisible(timeline, i))
          ? [layer.tilesetId]
          : [],
      ) ?? [],
    );
    for (const id of ids) {
      const tileset = timeline?.tilesets?.find((set) => set.id === id);
      if (!tileset) throw new Error(`Tileset ${id} is missing.`);
      const width = Math.max(1, Math.floor((tileset.tileWidth * o.scalePercent) / 100)),
        height = Math.max(1, Math.floor((tileset.tileHeight * o.scalePercent) / 100));
      samplePixels += width * height * tileset.tileCount;
      if (
        width > MAX_IMAGE_DIMENSION ||
        height > MAX_IMAGE_DIMENSION ||
        samplePixels > MAX_IMAGE_PIXELS
      )
        throw new RangeError("Sheet samples exceed the export memory budget.");
      for (let tileIndex = 0; tileIndex < tileset.tileCount; tileIndex++) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const offset =
              ((tileIndex * tileset.tileHeight +
                Math.min(tileset.tileHeight - 1, Math.floor((y * tileset.tileHeight) / height))) *
                tileset.tileWidth +
                Math.min(tileset.tileWidth - 1, Math.floor((x * tileset.tileWidth) / width))) *
              4;
            data.set(tileset.pixels.subarray(offset, offset + 4), (y * width + x) * 4);
          }
        if (o.ignoreEmpty && !data.some((value, index) => index % 4 === 3 && value !== 0)) continue;
        const pixels = convertPixelsToSrgb({ width, height, data }, workingColorProfile(timeline));
        samples.push({
          pixels,
          duration: timeline?.frames[0]?.duration ?? 100,
          sourceFrame: 0,
          outputFrame: tileIndex,
          bounds: transparentBounds(pixels),
          layer: tileset.name,
          tag: "",
          tilesetId: tileset.id,
          tileIndex,
        });
      }
    }
  }
  for (const root of o.source === "tilesets" ? [] : roots) {
    const source =
      root === undefined
        ? doc
        : {
            ...doc,
            timeline: {
              ...timeline!,
              range: {
                kind: "layers" as const,
                layers: [root],
                frames: timeline!.range?.frames ?? [timeline!.activeFrame],
              },
            },
          };
    const animations =
      o.splitTags && tags.length
        ? tags.map((tag) => ({ frames: `tag:${tag.name}` as const, tag: tag.name }))
        : [{ frames: o.frames, tag: "" }];
    for (const animation of animations) {
      const plan = {
        ...o,
        layers: root === undefined ? o.layers : ("selected" as const),
        frames: animation.frames,
      };
      const geometry = exportGeometry(source, plan);
      samplePixels += geometry.width * geometry.height * exportFrameOrder(source, plan).length;
      if (samplePixels > MAX_IMAGE_PIXELS)
        throw new RangeError("Sheet samples exceed the export memory budget.");
      for (const [outputFrame, frame] of renderExportAnimation(source, plan).entries())
        samples.push({
          ...frame,
          outputFrame,
          bounds: transparentBounds(frame.pixels),
          layer: root === undefined ? "" : timeline!.layers[root].name,
          tag: animation.tag,
        });
    }
  }
  if (!samples.length)
    throw new Error(
      o.source === "tilesets"
        ? "No tiles in the selected tilesets to export."
        : "No frames to export.",
    );
  const grid = timeline?.gridBounds ?? {
    x: timeline?.asepriteSource?.header.gridX ?? 0,
    y: timeline?.asepriteSource?.header.gridY ?? 0,
    width: timeline?.asepriteSource?.header.gridWidth || 16,
    height: timeline?.asepriteSource?.header.gridHeight || 16,
  };
  const snap = (b: Rect): Rect => {
    const x = grid.x + Math.floor((b.x - grid.x) / grid.width) * grid.width,
      y = grid.y + Math.floor((b.y - grid.y) / grid.height) * grid.height;
    return {
      x,
      y,
      width: grid.x + Math.ceil((b.x + b.width - grid.x) / grid.width) * grid.width - x,
      height: grid.y + Math.ceil((b.y + b.height - grid.y) / grid.height) * grid.height - y,
    };
  };
  const rawCommon =
    o.trimSprite && o.source !== "tilesets" ? samples.map((s) => s.bounds).reduce(union) : null;
  const common = rawCommon && o.trimByGrid ? snap(rawCommon) : rawCommon;
  samples.forEach((s, i) => {
    s.bounds = o.trimCels
      ? o.trimByGrid
        ? snap(s.bounds)
        : s.bounds
      : (common ?? { x: 0, y: 0, width: s.pixels.width, height: s.pixels.height });
    if (o.mergeDuplicates || o.layout === SheetLayout.Packed) {
      const previous = samples.slice(0, i).findIndex((p) => {
        if (p.bounds.width !== s.bounds.width || p.bounds.height !== s.bounds.height) return false;
        for (let y = 0; y < s.bounds.height; y++)
          for (let x = 0; x < s.bounds.width; x++)
            for (let c = 0; c < 4; c++)
              if (
                p.pixels.data[((y + p.bounds.y) * p.pixels.width + x + p.bounds.x) * 4 + c] !==
                s.pixels.data[((y + s.bounds.y) * s.pixels.width + x + s.bounds.x) * 4 + c]
              )
                return false;
        return true;
      });
      if (previous >= 0) s.duplicate = previous;
    }
  });
  const size = layoutSamples(samples, o),
    pixels: PixelBuffer = { ...size, data: new Uint8ClampedArray(size.width * size.height * 4) };
  const names = new Set<string>();
  const frameData = samples.map((sample, index) => {
    const b = sample.bounds,
      slot = sample.slot!,
      extrude = o.extrude ? 1 : 0,
      left = slot.x + extrude + o.innerPadding,
      top = slot.y + extrude + o.innerPadding;
    if (sample.duplicate === undefined)
      for (let y = -extrude; y < b.height + extrude; y++)
        for (let x = -extrude; x < b.width + extrude; x++) {
          const sx = b.x + Math.max(0, Math.min(b.width - 1, x)),
            sy = b.y + Math.max(0, Math.min(b.height - 1, y));
          if (sx < 0 || sy < 0 || sx >= sample.pixels.width || sy >= sample.pixels.height) continue;
          pixels.data.set(
            sample.pixels.data.subarray(
              (sy * sample.pixels.width + sx) * 4,
              (sy * sample.pixels.width + sx) * 4 + 4,
            ),
            ((top + y) * pixels.width + left + x) * 4,
          );
        }
    const title = doc.name.replace(/\.[^.]*$/, "");
    const tag =
      tags.find((tag) => tag.name === sample.tag) ??
      tags
        .filter((tag) => sample.sourceFrame >= tag.from && sample.sourceFrame <= tag.to)
        .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
    let filename = o.filenameFormat.replace(
      /\{(title|filename|extension|layer|tag|tagframe|frame\d*)\}/g,
      (_, key: string) =>
        key === "title"
          ? title
          : key === "filename"
            ? doc.name
            : key === "extension"
              ? doc.name.split(".").slice(-1)[0]
              : key === "layer"
                ? sample.layer
                : key === "tag"
                  ? (tag?.name ?? "")
                  : key === "tagframe"
                    ? String(tag ? sample.sourceFrame - tag.from : index)
                    : String(sample.outputFrame).padStart(key.slice(5).length, "0"),
    );
    if (!filename) filename = `${title} ${index}`;
    if (names.has(filename)) filename += ` ${index}`;
    names.add(filename);
    return {
      filename,
      frame: {
        x: left - o.innerPadding,
        y: top - o.innerPadding,
        w: b.width + 2 * o.innerPadding,
        h: b.height + 2 * o.innerPadding,
      },
      rotated: false as const,
      trimmed: b.width !== sample.pixels.width || b.height !== sample.pixels.height,
      spriteSourceSize: { x: b.x, y: b.y, w: b.width, h: b.height },
      sourceSize: { w: sample.pixels.width, h: sample.pixels.height },
      duration: sample.duration,
    };
  });
  const meta: Record<string, unknown> = {
    app: "Xprite",
    version: "1",
    image: o.name,
    format: "RGBA8888",
    size: { w: pixels.width, h: pixels.height },
    scale: String(o.scalePercent / 100),
  };
  if (o.listLayers && timeline)
    meta.layers = timeline.layers.map((l) => ({
      name: l.name,
      ...(l.parentId
        ? { group: timeline.layers.find((parent) => parent.id === l.parentId)?.name }
        : {}),
      ...(l.kind === "group"
        ? {}
        : {
            opacity: l.opacity,
            blendMode: (BLEND_MODES[l.blendMode ?? 0] ?? "Normal").toLowerCase().replace(/ /g, "_"),
          }),
    }));
  if (o.source === "tilesets")
    meta.tilesets = (timeline?.tilesets ?? [])
      .filter((tileset) => samples.some((sample) => sample.tilesetId === tileset.id))
      .map((tileset) => ({
        id: tileset.id,
        name: tileset.name,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        tileCount: tileset.tileCount,
        baseIndex: tileset.baseIndex,
        tiles: samples.flatMap((sample, index) =>
          sample.tilesetId === tileset.id
            ? [
                {
                  index: sample.tileIndex,
                  filename: frameData[index].filename,
                  frame: frameData[index].frame,
                },
              ]
            : [],
        ),
      }));
  if (o.listTags && o.source !== "tilesets")
    meta.frameTags = tags.flatMap((tag) => {
      const positions = samples.flatMap((s, i) =>
        s.sourceFrame >= tag.from && s.sourceFrame <= tag.to ? [i] : [],
      );
      return positions.length
        ? [
            {
              name: (o.tagnameFormat ?? "{tag}").replace(/\{(tag|title|filename)\}/g, (_, key) =>
                key === "tag"
                  ? tag.name
                  : key === "filename"
                    ? doc.name
                    : doc.name.replace(/\.[^.]*$/, ""),
              ),
              from: Math.min(...positions),
              to: Math.max(...positions),
              direction: tag.direction,
              repeat: tag.repeat,
            },
          ]
        : [];
    });
  if (o.listSlices && o.source !== "tilesets")
    meta.slices = sliceMetadataForExport(timeline?.slices ?? []);
  const frames =
    o.dataFormat === "array"
      ? frameData
      : Object.fromEntries(frameData.map(({ filename, ...data }) => [filename, data]));
  return { pixels, data: { frames, meta }, samples: frameData };
}
