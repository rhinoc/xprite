import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX, UINT16_MAX, INT16_MAX, INT16_MIN } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { activateTimelineCel, ensureTimeline } from "$/document/document";
import type { EditorProject } from "$/document/project";
import type { EditorDocument } from "$/document/types";
import { AsepriteTagDirection } from "$/import-export/aseprite/model";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";
import { timelineTags, withTimelineTags } from "$/timeline/operations/timeline-range";
import { MAX_TIMELINE_FRAMES } from "$/timeline/timeline";

export interface ImportSpriteSheetOptions {
  layout: "horizontal" | "vertical" | "rows" | "columns";
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  paddingEnabled: boolean;
  horizontalPadding: number;
  verticalPadding: number;
  partialTiles: boolean;
  duration?: number;
}
export function defaultImportSpriteSheetOptions(image: PixelBuffer): ImportSpriteSheetOptions {
  return {
    layout: "rows",
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    columns: Math.floor(image.width / 16),
    rows: Math.floor(image.height / 16),
    paddingEnabled: false,
    horizontalPadding: 0,
    verticalPadding: 0,
    partialTiles: false,
    duration: 100,
  };
}
export function spriteSheetTileCounts(
  image: Pick<PixelBuffer, "width" | "height">,
  o: ImportSpriteSheetOptions,
): { columns: number; rows: number } {
  const count = (available: number, size: number, padding: number) =>
    Math.max(
      0,
      o.partialTiles
        ? Math.ceil(available / (size + padding))
        : Math.floor((available + padding) / (size + padding)),
    );
  return {
    columns:
      o.layout === "vertical"
        ? 1
        : count(image.width - o.x, o.width, o.paddingEnabled ? o.horizontalPadding : 0),
    rows:
      o.layout === "horizontal"
        ? 1
        : count(image.height - o.y, o.height, o.paddingEnabled ? o.verticalPadding : 0),
  };
}
export function changeImportSpriteSheetOptions(
  image: PixelBuffer,
  old: ImportSpriteSheetOptions,
  key: keyof ImportSpriteSheetOptions,
  value: ImportSpriteSheetOptions[typeof key],
): ImportSpriteSheetOptions {
  const next = { ...old, [key]: value };
  if (key === "columns")
    next.width = Math.max(
      1,
      Math.floor(
        (image.width -
          next.x -
          (next.paddingEnabled ? next.horizontalPadding : 0) * (next.columns - 1)) /
          Math.max(1, next.columns),
      ),
    );
  else if (key === "rows")
    next.height = Math.max(
      1,
      Math.floor(
        (image.height -
          next.y -
          (next.paddingEnabled ? next.verticalPadding : 0) * (next.rows - 1)) /
          Math.max(1, next.rows),
      ),
    );
  else Object.assign(next, spriteSheetTileCounts(image, { ...next, partialTiles: false }));
  return next;
}
function tile(
  image: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= image.height) continue;
    for (let col = 0; col < width; col++) {
      const sx = x + col;
      if (sx >= 0 && sx < image.width)
        data.set(
          image.data.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4),
          (row * width + col) * 4,
        );
    }
  }
  return { width, height, data };
}
export function importSpriteSheet(image: PixelBuffer, o: ImportSpriteSheetOptions): EditorProject {
  for (const v of [o.width, o.height, o.columns, o.rows, o.horizontalPadding, o.verticalPadding])
    if (!Number.isInteger(v) || v < 0) throw new RangeError("Invalid sprite sheet tile geometry.");
  if (
    !Number.isInteger(o.x) ||
    !Number.isInteger(o.y) ||
    o.x < INT16_MIN ||
    o.y < INT16_MIN ||
    o.x > INT16_MAX ||
    o.y > INT16_MAX
  )
    throw new RangeError("Invalid sprite-sheet origin.");
  if (
    !o.width ||
    !o.height ||
    o.width > MAX_IMAGE_DIMENSION ||
    o.height > MAX_IMAGE_DIMENSION ||
    !["rows", "columns", "horizontal", "vertical"].includes(o.layout)
  )
    throw new RangeError("Invalid sprite sheet dimensions.");
  const { columns, rows } = spriteSheetTileCounts(image, o);
  if (
    columns * rows > MAX_TIMELINE_FRAMES ||
    columns * rows * o.width * o.height > MAX_IMAGE_PIXELS
  )
    throw new RangeError("Sprite sheet import exceeds the frame or pixel budget.");
  const hp = o.paddingEnabled ? o.horizontalPadding : 0,
    vp = o.paddingEnabled ? o.verticalPadding : 0;
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < columns * rows; i++) {
    const col = o.layout === "columns" ? Math.floor(i / rows) : i % columns,
      row = o.layout === "columns" ? i % rows : Math.floor(i / columns);
    const x = o.x + col * (o.width + hp),
      y = o.y + row * (o.height + vp);
    if (
      x >= image.width ||
      y >= image.height ||
      (!o.partialTiles && (x + o.width > image.width || y + o.height > image.height))
    )
      continue;
    positions.push({ x, y });
  }
  if (!positions.length) throw new Error("No tiles fit inside the sprite sheet.");
  const duration = o.duration ?? 100;
  if (!Number.isInteger(duration) || duration < 1 || duration > UINT16_MAX)
    throw new RangeError("Invalid frame duration.");
  const frames = positions.map((p) => ({
    duration,
    cels: [
      {
        pixels: tile(image, p.x, p.y, o.width, o.height),
        x: 0,
        y: 0,
        opacity: UINT8_MAX,
        zIndex: 0,
      },
    ],
  }));
  return {
    image: frames[0].cels[0].pixels,
    timeline: {
      layers: [
        {
          id: "layer-1",
          name: "Sprite Sheet",
          visible: true,
          locked: false,
          opacity: UINT8_MAX,
          flags: 3,
        },
      ],
      frames,
      activeFrame: 0,
      activeLayer: 0,
    },
  };
}
/** Aseprite-compatible JSON Array/Hash import restores trimmed offsets and timing.
 * Rotated atlas entries are rejected rather than decoded as unrotated pixels. */
export function importSpriteSheetData(image: PixelBuffer, input: unknown): EditorProject {
  const data = input as { frames?: unknown; meta?: { frameTags?: unknown } };
  const entries = Array.isArray(data?.frames)
    ? data.frames
    : Object.values(data?.frames && typeof data.frames === "object" ? data.frames : {});
  if (!entries.length || entries.length > MAX_TIMELINE_FRAMES)
    throw new Error("Sprite sheet JSON contains no valid frames.");
  let width = 0,
    height = 0;
  const frames = entries.map((entry: any) => {
    const rect = entry.frame,
      source = entry.sourceSize ?? { w: rect?.w, h: rect?.h },
      offset = entry.spriteSourceSize ?? { x: 0, y: 0 };
    if (entry.rotated) throw new Error("Rotated sprite-sheet frames are not supported.");
    if (
      !rect ||
      [rect.x, rect.y, rect.w, rect.h, source.w, source.h, offset.x, offset.y].some(
        (v) => !Number.isSafeInteger(v),
      ) ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.w < 1 ||
      rect.h < 1 ||
      source.w < 1 ||
      source.h < 1 ||
      rect.x + rect.w > image.width ||
      rect.y + rect.h > image.height
    )
      throw new Error("Invalid sprite-sheet frame bounds.");
    width = Math.max(width, source.w);
    height = Math.max(height, source.h);
    const duration = entry.duration ?? 100;
    if (!Number.isInteger(duration) || duration < 1 || duration > UINT16_MAX)
      throw new Error("Invalid sprite-sheet duration.");
    const contentWidth = entry.spriteSourceSize?.w ?? rect.w,
      contentHeight = entry.spriteSourceSize?.h ?? rect.h;
    if (
      !Number.isInteger(contentWidth) ||
      !Number.isInteger(contentHeight) ||
      contentWidth < 1 ||
      contentHeight < 1 ||
      contentWidth > rect.w ||
      contentHeight > rect.h
    )
      throw new Error("Invalid sprite-sheet content bounds.");
    const paddingX = Math.floor((rect.w - contentWidth) / 2),
      paddingY = Math.floor((rect.h - contentHeight) / 2);
    return {
      duration,
      cels: [
        {
          pixels: tile(image, rect.x + paddingX, rect.y + paddingY, contentWidth, contentHeight),
          x: offset.x,
          y: offset.y,
          opacity: UINT8_MAX,
          zIndex: 0,
        },
      ],
    };
  });
  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height * frames.length > MAX_IMAGE_PIXELS
  )
    throw new RangeError("Sprite-sheet JSON exceeds the import pixel budget.");
  const output: PixelBuffer = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  // Project image defines canvas dimensions, timeline retains trimmed cel geometry.
  const tags = Array.isArray(data.meta?.frameTags)
    ? data.meta.frameTags.map((tag: any) => {
        if (
          typeof tag.name !== "string" ||
          !Number.isInteger(tag.from) ||
          !Number.isInteger(tag.to) ||
          tag.from < 0 ||
          tag.to < tag.from ||
          tag.to >= frames.length ||
          ![
            AsepriteTagDirection.Forward,
            AsepriteTagDirection.Reverse,
            AsepriteTagDirection.PingPong,
            AsepriteTagDirection.PingPongReverse,
          ].includes(tag.direction ?? AsepriteTagDirection.Forward)
        )
          throw new Error("Invalid sprite-sheet animation tag.");
        return {
          name: tag.name,
          from: tag.from,
          to: tag.to,
          direction: tag.direction ?? AsepriteTagDirection.Forward,
          repeat: Number.isInteger(tag.repeat) ? tag.repeat : 0,
          color: [0, 0, 0, UINT8_MAX] as [number, number, number, number],
        };
      })
    : [];
  return {
    image: output,
    timeline: {
      tags,
      layers: [
        {
          id: "layer-1",
          name: "Sprite Sheet",
          visible: true,
          locked: false,
          opacity: UINT8_MAX,
          flags: 3,
        },
      ],
      frames,
      activeFrame: 0,
      activeLayer: 0,
    },
  };
}

/** cmd_import_sprite_sheet.cpp replaces all root layers inside ONE Aseprite undo
 * transaction, retaining document identity and resizing the timeline/canvas.
 * Caller wraps this mutation in RasterEditor.changeDocument. */
export function applyImportSpriteSheet(
  doc: EditorDocument,
  options: ImportSpriteSheetOptions,
): boolean {
  const detached = { ...doc, layer: { ...doc.layer } };
  const original = ensureTimeline(detached);
  const source = compositeTimeline(detached, original.activeFrame, undefined, false);
  const project = importSpriteSheet(source, options),
    count = project.timeline!.frames.length;
  let n = 1;
  while (original.layers.some((l) => l.id === `layer-${n}`)) n++;
  const layer = { ...project.timeline!.layers[0], id: `layer-${n}` };
  const frames = project.timeline!.frames.map((f, i) => ({
    ...f,
    duration: original.frames[Math.min(i, original.frames.length - 1)].duration,
  }));
  const tags = timelineTags(original).flatMap((tag) =>
    tag.from >= count ? [] : [{ ...tag, to: Math.min(tag.to, count - 1) }],
  );
  doc.width = options.width;
  doc.height = options.height;
  doc.timeline = withTimelineTags(
    {
      ...original,
      layers: [layer],
      frames,
      activeFrame: Math.min(original.activeFrame, count - 1),
      activeLayer: 0,
      range: undefined,
    },
    tags,
  );
  activateTimelineCel(doc, doc.timeline.activeFrame, 0);
  return true;
}
