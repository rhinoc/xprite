import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { PixelBuffer, PixelMask, Point, Rect } from "$/base/primitives";
import type { EditorLayer } from "$/document/types";
import type { SelectionHandle, SelectionTransform } from "$/selection/types";
import { SelectionPivotPosition, SelectionRotationAlgorithm } from "$/selection/types";
export type { SelectionHandle, SelectionTransform } from "$/selection/types";
import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";

export const maskContains = (mask: PixelMask, p: Point) => {
  const x = Math.floor(p.x) - mask.x,
    y = Math.floor(p.y) - mask.y;
  return x >= 0 && y >= 0 && x < mask.width && y < mask.height && !!mask.data[y * mask.width + x];
};
export function extractSelection(layer: EditorLayer, mask: PixelMask): PixelBuffer {
  const out = {
    width: mask.width,
    height: mask.height,
    data: new Uint8ClampedArray(mask.width * mask.height * 4),
  };
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++)
      if (mask.data[y * mask.width + x]) {
        const sx = mask.x + x - layer.x,
          sy = mask.y + y - layer.y;
        if (sx >= 0 && sy >= 0 && sx < layer.pixels.width && sy < layer.pixels.height) {
          const from = (sy * layer.pixels.width + sx) * 4,
            to = (y * mask.width + x) * 4;
          out.data[to] = layer.pixels.data[from];
          out.data[to + 1] = layer.pixels.data[from + 1];
          out.data[to + 2] = layer.pixels.data[from + 2];
          out.data[to + 3] = layer.pixels.data[from + 3];
        }
      }
  return out;
}
const CENTER_PIVOT = { x: 0.5, y: 0.5 };
const ROTSPRITE_MAX_PASSES = 3;
const PIXEL_ART_ROTATION_ANGLES = [
  0, 26.565, 45, 63.435, 90, 116.565, 135, 153.435, 180, -153.435, -135, -116.565, -90, -63.435,
  -45, -26.565,
].map((degrees) => (degrees * Math.PI) / 180);
const FULL_ROTATION = Math.PI * 2;

function snapSelectionRotation(angle: number): number {
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  let closest = PIXEL_ART_ROTATION_ANGLES[0];
  let distance = Infinity;
  for (const candidate of PIXEL_ART_ROTATION_ANGLES) {
    const delta = Math.abs(
      Math.atan2(Math.sin(normalized - candidate), Math.cos(normalized - candidate)),
    );
    if (delta < distance) {
      closest = candidate;
      distance = delta;
    }
  }
  return closest + Math.round((angle - closest) / FULL_ROTATION) * FULL_ROTATION;
}
const ROTSPRITE_MAX_WORK_PIXELS = 4_194_304;
const ROTSPRITE_MAX_VOTE_SAMPLES = 2_097_152;

export function selectionPivotFraction(position: SelectionPivotPosition | Point): Point {
  if (typeof position !== "string")
    return {
      x: Math.max(-1, Math.min(2, Number.isFinite(position.x) ? position.x : CENTER_PIVOT.x)),
      y: Math.max(-1, Math.min(2, Number.isFinite(position.y) ? position.y : CENTER_PIVOT.y)),
    };
  switch (position) {
    case SelectionPivotPosition.Northwest:
      return { x: 0, y: 0 };
    case SelectionPivotPosition.North:
      return { x: 0.5, y: 0 };
    case SelectionPivotPosition.Northeast:
      return { x: 1, y: 0 };
    case SelectionPivotPosition.West:
      return { x: 0, y: 0.5 };
    case SelectionPivotPosition.East:
      return { x: 1, y: 0.5 };
    case SelectionPivotPosition.Southwest:
      return { x: 0, y: 1 };
    case SelectionPivotPosition.South:
      return { x: 0.5, y: 1 };
    case SelectionPivotPosition.Southeast:
      return { x: 1, y: 1 };
    default:
      return { ...CENTER_PIVOT };
  }
}

export function selectionPivotPoint(
  bounds: Rect,
  angle: number,
  position: SelectionPivotPosition | Point = CENTER_PIVOT,
): Point {
  const fraction = selectionPivotFraction(position),
    offsetX = (fraction.x - 0.5) * bounds.width,
    offsetY = (fraction.y - 0.5) * bounds.height,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    x: bounds.x + bounds.width / 2 + offsetX * c - offsetY * s,
    y: bounds.y + bounds.height / 2 + offsetX * s + offsetY * c,
  };
}

export function selectionTransformPivotPoint(value: SelectionTransform): Point {
  return (
    value.pivotPoint ??
    selectionPivotPoint(value.bounds, value.angle, value.pivotPosition ?? CENTER_PIVOT)
  );
}

function withPivotPoint(value: SelectionTransform, point: Point): SelectionTransform {
  const cx = value.bounds.x + value.bounds.width / 2,
    cy = value.bounds.y + value.bounds.height / 2,
    dx = point.x - cx,
    dy = point.y - cy,
    c = Math.cos(value.angle),
    s = Math.sin(value.angle);
  return {
    ...value,
    pivotPoint: { ...point },
    pivotPosition: {
      x: value.bounds.width
        ? Math.max(-1, Math.min(2, (dx * c + dy * s) / value.bounds.width + 0.5))
        : (value.pivotPosition?.x ?? CENTER_PIVOT.x),
      y: value.bounds.height
        ? Math.max(-1, Math.min(2, (-dx * s + dy * c) / value.bounds.height + 0.5))
        : (value.pivotPosition?.y ?? CENTER_PIVOT.y),
    },
  };
}

export function transformCorners(bounds: Rect, angle = 0): Point[] {
  const c = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    co = Math.cos(angle),
    si = Math.sin(angle);
  return [
    [0, 0],
    [bounds.width, 0],
    [bounds.width, bounds.height],
    [0, bounds.height],
  ].map(([x, y]) => ({
    x: c.x + (x - bounds.width / 2) * co - (y - bounds.height / 2) * si,
    y: c.y + (x - bounds.width / 2) * si + (y - bounds.height / 2) * co,
  }));
}
interface TransformSampleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function transformSampleBounds(value: SelectionTransform): TransformSampleBounds {
  if (
    ![value.bounds.x, value.bounds.y, value.bounds.width, value.bounds.height, value.angle].every(
      Number.isFinite,
    )
  )
    throw new RangeError("Invalid selection transform");
  const corners = transformCorners(value.bounds, value.angle),
    xs = corners.map((p) => p.x),
    ys = corners.map((p) => p.y),
    x = Math.floor(Math.min(...xs) + 1e-8),
    y = Math.floor(Math.min(...ys) + 1e-8),
    width = Math.max(1, Math.ceil(Math.max(...xs) - 1e-8) - x),
    height = Math.max(1, Math.ceil(Math.max(...ys) - 1e-8) - y);
  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new EditorAllocationError(width, height);
  return {
    x,
    y,
    width,
    height,
    centerX: value.bounds.x + value.bounds.width / 2,
    centerY: value.bounds.y + value.bounds.height / 2,
  };
}

interface TransformSamples {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  mask: Uint8Array;
}

function pixelKey(data: Uint8ClampedArray, index: number): number {
  const at = index * 4;
  return ((data[at] * 256 + data[at + 1]) * 256 + data[at + 2]) * 256 + data[at + 3];
}

function sameSample(samples: TransformSamples, first: number, second: number): boolean {
  if (samples.mask[first] !== samples.mask[second]) return false;
  const a = first * 4,
    b = second * 4;
  return (
    samples.data[a] === samples.data[b] &&
    samples.data[a + 1] === samples.data[b + 1] &&
    samples.data[a + 2] === samples.data[b + 2] &&
    samples.data[a + 3] === samples.data[b + 3]
  );
}

/** One EPX enlargement pass. Selection occupancy participates in edge tests,
 * so transparent gaps remain distinct from opaque source colors. */
function scaleEpx2x(source: TransformSamples): TransformSamples {
  const width = source.width * 2,
    height = source.height * 2,
    data = new Uint8ClampedArray(width * height * 4),
    mask = new Uint8Array(width * height),
    at = (x: number, y: number) => y * source.width + x;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const p = at(x, y),
        a = at(x, y ? y - 1 : y),
        b = at(x < source.width - 1 ? x + 1 : x, y),
        c = at(x ? x - 1 : x, y),
        d = at(x, y < source.height - 1 ? y + 1 : y),
        outputs = [
          sameSample(source, c, a) && !sameSample(source, c, d) && !sameSample(source, a, b)
            ? a
            : p,
          sameSample(source, a, b) && !sameSample(source, a, c) && !sameSample(source, b, d)
            ? b
            : p,
          sameSample(source, d, c) && !sameSample(source, d, b) && !sameSample(source, c, a)
            ? c
            : p,
          sameSample(source, b, d) && !sameSample(source, b, a) && !sameSample(source, d, c)
            ? d
            : p,
        ],
        positions = [
          2 * y * width + 2 * x,
          2 * y * width + 2 * x + 1,
          (2 * y + 1) * width + 2 * x,
          (2 * y + 1) * width + 2 * x + 1,
        ];
      for (let i = 0; i < outputs.length; i++) {
        const from = outputs[i] * 4,
          to = positions[i] * 4;
        data.set(source.data.subarray(from, from + 4), to);
        mask[positions[i]] = source.mask[outputs[i]] ? 1 : 0;
      }
    }
  return { width, height, data, mask };
}

function rotSpritePasses(width: number, height: number, outputPixels: number): number {
  let passes = ROTSPRITE_MAX_PASSES;
  while (
    passes > 0 &&
    (width * height * 4 ** passes > ROTSPRITE_MAX_WORK_PIXELS ||
      width * 2 ** passes > MAX_IMAGE_DIMENSION ||
      height * 2 ** passes > MAX_IMAGE_DIMENSION ||
      outputPixels * 4 ** passes > ROTSPRITE_MAX_VOTE_SAMPLES)
  )
    passes--;
  return passes;
}

function transformHasAxisAlignedPixelShape(value: SelectionTransform): boolean {
  const quarterTurns = value.angle / (Math.PI / 2);
  return (
    Math.abs(quarterTurns - Math.round(quarterTurns)) < 1e-10 &&
    Math.abs(value.bounds.width) === value.source.width &&
    Math.abs(value.bounds.height) === value.source.height
  );
}

function makeTransformPixels(value: SelectionTransform): Uint8ClampedArray {
  const key = value.transparentColor ?? ([0, 0, 0, 0] as const);
  if (!value.opaque && key[3] === 0) return value.source.data;
  const data = value.source.data.slice();
  for (let i = 0; i < value.mask.data.length; i++) {
    if (!value.mask.data[i]) continue;
    const at = i * 4,
      alpha = data[at + 3],
      matchesKey =
        key[3] > 0 && data[at] === key[0] && data[at + 1] === key[1] && data[at + 2] === key[2];
    if (alpha !== 0 && !matchesKey) continue;
    if (value.opaque) data.set([key[0], key[1], key[2], UINT8_MAX], at);
    else data[at + 3] = 0;
  }
  return data;
}

function transformSamples(
  source: TransformSamples,
  value: SelectionTransform,
  bounds: TransformSampleBounds,
): { data: Uint8ClampedArray; mask: Uint8Array } {
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4),
    mask = new Uint8Array(bounds.width * bounds.height),
    angleCos = Math.cos(value.angle),
    angleSin = Math.sin(value.angle),
    requestRotSprite =
      value.rotationAlgorithm === SelectionRotationAlgorithm.RotSprite &&
      !transformHasAxisAlignedPixelShape(value);
  // A handle can pass through its anchor before reversing the image. Keep the
  // degenerate transform alive with an empty footprint at that crossing.
  if (!value.bounds.width || !value.bounds.height) return { data, mask };
  let working = source,
    passes = 0;
  if (requestRotSprite) {
    passes = rotSpritePasses(source.width, source.height, bounds.width * bounds.height);
    while (passes > 0) {
      try {
        working = source;
        for (let pass = 0; pass < passes; pass++) working = scaleEpx2x(working);
        break;
      } catch {
        // The fast inverse mapper remains available when a bounded EPX buffer
        // cannot be allocated by the browser.
        passes--;
      }
    }
    if (!passes) working = source;
  }
  if (!passes) {
    for (let y = 0; y < bounds.height; y++)
      for (let x = 0; x < bounds.width; x++) {
        const dx = bounds.x + x + 0.5 - bounds.centerX,
          dy = bounds.y + y + 0.5 - bounds.centerY,
          sx = Math.floor(
            ((dx * angleCos + dy * angleSin) / value.bounds.width + 0.5) * source.width,
          ),
          sy = Math.floor(
            ((-dx * angleSin + dy * angleCos) / value.bounds.height + 0.5) * source.height,
          );
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
        const sourceIndex = sy * source.width + sx;
        if (!source.mask[sourceIndex]) continue;
        const out = y * bounds.width + x;
        mask[out] = UINT8_MAX;
        data.set(source.data.subarray(sourceIndex * 4, sourceIndex * 4 + 4), out * 4);
      }
    return { data, mask };
  }
  const samplesPerAxis = passes ? 1 << passes : 1,
    sampleCount = samplesPerAxis * samplesPerAxis;
  for (let y = 0; y < bounds.height; y++)
    for (let x = 0; x < bounds.width; x++) {
      const out = y * bounds.width + x,
        votes = new Map<number, { count: number; sample: number[] }>();
      let selectedSamples = 0;
      const sampleSubpixel = (sampleX: number, sampleY: number) => {
        const dx = bounds.x + x + (sampleX + 0.5) / samplesPerAxis - bounds.centerX,
          dy = bounds.y + y + (sampleY + 0.5) / samplesPerAxis - bounds.centerY,
          localX = ((dx * angleCos + dy * angleSin) / value.bounds.width + 0.5) * source.width,
          localY = ((-dx * angleSin + dy * angleCos) / value.bounds.height + 0.5) * source.height,
          sx = Math.floor(localX * samplesPerAxis),
          sy = Math.floor(localY * samplesPerAxis);
        if (sx < 0 || sy < 0 || sx >= working.width || sy >= working.height) return;
        const sourceIndex = sy * working.width + sx;
        if (!working.mask[sourceIndex]) return;
        selectedSamples++;
        const key = pixelKey(working.data, sourceIndex),
          vote = votes.get(key);
        if (vote) vote.count++;
        else {
          const at = sourceIndex * 4;
          votes.set(key, {
            count: 1,
            sample: Array.from(working.data.subarray(at, at + 4)),
          });
        }
      };
      for (let sampleY = 0; sampleY < samplesPerAxis; sampleY++)
        for (let sampleX = 0; sampleX < samplesPerAxis; sampleX++) sampleSubpixel(sampleX, sampleY);
      if (selectedSamples * 2 < sampleCount) continue;
      let best: { count: number; sample: number[] } | null = null;
      for (const vote of votes.values()) if (!best || vote.count > best.count) best = vote;
      if (!best) continue;
      mask[out] = UINT8_MAX;
      data.set(best.sample, out * 4);
    }
  return { data, mask };
}

/** Fast uses nearest-neighbor sampling. RotSprite applies bounded EPX
 * enlargement, rotates at that scale, then resolves each output pixel from its
 * high-resolution footprint; allocation or work-budget limits fall back to
 * Fast without risking the document's ordinary cel budget. */
export function rasterizeSelectionTransform(value: SelectionTransform): {
  pixels: PixelBuffer;
  mask: PixelMask;
} {
  const bounds = transformSampleBounds(value),
    data = makeTransformPixels(value),
    source: TransformSamples = {
      width: value.source.width,
      height: value.source.height,
      data,
      mask: value.mask.data,
    },
    transformed = transformSamples(source, value, bounds);
  return {
    pixels: { width: bounds.width, height: bounds.height, data: transformed.data },
    mask: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      data: transformed.mask,
    },
  };
}

/** RotSprite or color-key transforms produce new RGBA samples. Let document
 * normalization map them back to the source palette instead of writing stale
 * source indices over the transformed colors. */
export function canKeepSelectionAsepriteSamples(value: SelectionTransform): boolean {
  if (
    value.rotationAlgorithm === SelectionRotationAlgorithm.RotSprite &&
    !transformHasAxisAlignedPixelShape(value)
  )
    return false;
  const key = value.transparentColor ?? [0, 0, 0, 0];
  for (let i = 0; i < value.mask.data.length; i++) {
    if (!value.mask.data[i]) continue;
    const at = i * 4,
      alpha = value.source.data[at + 3],
      matchesKey =
        key[3] > 0 &&
        value.source.data[at] === key[0] &&
        value.source.data[at + 1] === key[1] &&
        value.source.data[at + 2] === key[2];
    if (value.opaque ? alpha === 0 : matchesKey && alpha !== 0) return false;
  }
  return true;
}
export function dragSelectionTransform(
  initial: SelectionTransform,
  handle: SelectionHandle,
  start: Point,
  current: Point,
  shift = false,
  alt = false,
  lockAxis = shift,
  fineControl = false,
): SelectionTransform {
  const bounds = { ...initial.bounds },
    pivot = selectionTransformPivotPoint(initial),
    pivotPosition = initial.pivotPosition ?? CENTER_PIVOT;
  if (handle === "pivot") return withPivotPoint(initial, current);
  if (handle === "move" || handle === "bounds") {
    let dx = fineControl ? current.x - start.x : Math.floor(current.x) - Math.floor(start.x),
      dy = fineControl ? current.y - start.y : Math.floor(current.y) - Math.floor(start.y);
    if (lockAxis) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    return {
      ...initial,
      bounds: { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
      pivotPoint: { x: pivot.x + dx, y: pivot.y + dy },
    };
  }
  if (handle.startsWith("rotate")) {
    const from = Math.atan2(start.y - pivot.y, start.x - pivot.x),
      to = Math.atan2(current.y - pivot.y, current.x - pivot.x),
      delta = Math.atan2(Math.sin(to - from), Math.cos(to - from)),
      angle = shift ? snapSelectionRotation(initial.angle + delta) : initial.angle + delta,
      offsetX = bounds.x + bounds.width / 2 - pivot.x,
      offsetY = bounds.y + bounds.height / 2 - pivot.y,
      actualDelta = angle - initial.angle,
      c = Math.cos(actualDelta),
      s = Math.sin(actualDelta);
    return {
      ...initial,
      bounds: {
        ...bounds,
        x: pivot.x + offsetX * c - offsetY * s - bounds.width / 2,
        y: pivot.y + offsetX * s + offsetY * c - bounds.height / 2,
      },
      angle,
      pivotPoint: pivot,
    };
  }

  const c = Math.cos(initial.angle),
    s = Math.sin(initial.angle),
    center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    handleFraction = {
      x: handle.includes("w") ? 0 : handle.includes("e") ? 1 : 0.5,
      y: handle.includes("n") ? 0 : handle.includes("s") ? 1 : 0.5,
    },
    anchorFraction = alt ? pivotPosition : { x: 1 - handleFraction.x, y: 1 - handleFraction.y },
    anchor = alt ? pivot : selectionPivotPoint(bounds, initial.angle, anchorFraction),
    anchorOffset = {
      x: (anchor.x - center.x) * c + (anchor.y - center.y) * s,
      y: -(anchor.x - center.x) * s + (anchor.y - center.y) * c,
    },
    anchorLocalFraction = {
      x: bounds.width ? anchorOffset.x / bounds.width + 0.5 : anchorFraction.x,
      y: bounds.height ? anchorOffset.y / bounds.height + 0.5 : anchorFraction.y,
    },
    localDelta = {
      x: (current.x - start.x) * c + (current.y - start.y) * s,
      y: -(current.x - start.x) * s + (current.y - start.y) * c,
    };
  let width = bounds.width,
    height = bounds.height;
  if (shift) {
    // Projection onto the initial drag ray preserves aspect for edge and corner handles.
    const rayX = start.x - anchor.x,
      rayY = start.y - anchor.y,
      lengthSquared = rayX * rayX + rayY * rayY,
      scale = lengthSquared
        ? ((current.x - anchor.x) * rayX + (current.y - anchor.y) * rayY) / lengthSquared
        : 1;
    width *= scale;
    height *= scale;
  } else {
    if (!fineControl) {
      localDelta.x = Math.trunc(localDelta.x);
      localDelta.y = Math.trunc(localDelta.y);
    }
    if (handleFraction.x !== 0.5 && handleFraction.x !== anchorLocalFraction.x)
      width += localDelta.x / (handleFraction.x - anchorLocalFraction.x);
    if (handleFraction.y !== 0.5 && handleFraction.y !== anchorLocalFraction.y)
      height += localDelta.y / (handleFraction.y - anchorLocalFraction.y);
  }
  const centerOffsetX = (0.5 - anchorLocalFraction.x) * width,
    centerOffsetY = (0.5 - anchorLocalFraction.y) * height,
    next = {
      ...initial,
      bounds: {
        x: anchor.x + centerOffsetX * c - centerOffsetY * s - width / 2,
        y: anchor.y + centerOffsetX * s + centerOffsetY * c - height / 2,
        width,
        height,
      },
    };
  return withPivotPoint(
    next,
    alt ? pivot : selectionPivotPoint(next.bounds, next.angle, pivotPosition),
  );
}

/** Fixed-angle commands rotate around the selected pivot preset/custom point. */
export function rotateSelectionTransform(
  value: SelectionTransform,
  degrees: number,
): SelectionTransform {
  if (!Number.isFinite(degrees)) return value;
  const delta = (degrees * Math.PI) / 180,
    pivot = selectionTransformPivotPoint(value),
    center = {
      x: value.bounds.x + value.bounds.width / 2,
      y: value.bounds.y + value.bounds.height / 2,
    },
    offsetX = center.x - pivot.x,
    offsetY = center.y - pivot.y,
    c = Math.cos(delta),
    s = Math.sin(delta),
    rotatedCenter = {
      x: pivot.x + offsetX * c - offsetY * s,
      y: pivot.y + offsetX * s + offsetY * c,
    },
    angle = value.angle + delta,
    next = {
      ...value,
      angle,
      bounds: {
        ...value.bounds,
        x: rotatedCenter.x - value.bounds.width / 2,
        y: rotatedCenter.y - value.bounds.height / 2,
      },
    };
  return { ...next, pivotPoint: pivot };
}
/** Source transform_handles.cpp clockwise corner/midpoint ordering. */
export function selectionHandlePositions(
  bounds: Rect,
  angle = 0,
): { handle: SelectionHandle; point: Point; angle: number }[] {
  const p = transformCorners(bounds, angle);
  return (
    [
      ["e", 1, 2, 0],
      ["ne", 1, 1, -Math.PI / 4],
      ["n", 0, 1, -Math.PI / 2],
      ["nw", 0, 0, (-3 * Math.PI) / 4],
      ["w", 0, 3, Math.PI],
      ["sw", 3, 3, (3 * Math.PI) / 4],
      ["s", 3, 2, Math.PI / 2],
      ["se", 2, 2, Math.PI / 4],
    ] as const
  ).map(([handle, a, b, direction]) => ({
    handle,
    point: { x: (p[a].x + p[b].x) / 2, y: (p[a].y + p[b].y) / 2 },
    angle: angle + direction,
  }));
}

export const asepriteSelectionHandleRect = (x: number, y: number, w: number, angle: number) => {
  const i = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  // transform_handles.cpp uses integer division (handle_w / 2). Math.floor
  // on the negative offset made a 5px midpoint handle start three pixels away.
  const half = Math.trunc(w / 2);
  const offsets = [
    [0, -half],
    [0, 0],
    [-half, 0],
    [-w, 0],
    [-w, -half],
    [-w, -w],
    [-half, -w],
    [0, -w],
  ];
  return {
    x: Math.floor(x + offsets[i][0]),
    y: Math.floor(y + offsets[i][1]),
    width: w,
    height: w,
  };
};

export function hitSelectionHandles(
  targets: readonly { handle: SelectionHandle; screen: Point; angle: number }[],
  p: Point,
): SelectionHandle | null {
  for (const size of [10, 15])
    for (const t of targets) {
      if (size === 15 && t.handle.length !== 2) continue;
      const r = asepriteSelectionHandleRect(t.screen.x, t.screen.y, size, t.angle);
      if (p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height)
        return size === 10 ? t.handle : (`rotate-${t.handle}` as SelectionHandle);
    }
  return null;
}

/** One-pixel logical segment of a selection mask boundary. */
export interface SelectionBoundarySegment {
  axis: "horizontal" | "vertical";
  x: number;
  y: number;
  length: number;
}

/**
 * Return the visible edges of a mask in document-pixel coordinates. Edges are
 * merged into straight runs so the browser adapter can cache and project them
 * without rebuilding a Path2D on every marching-ants tick.
 */
export function selectionBoundarySegments(mask: PixelMask): SelectionBoundarySegment[] {
  const horizontal = new Map<number, number[]>();
  const vertical = new Map<number, number[]>();
  const has = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.data[y * mask.width + x] !== 0;
  const add = (map: Map<number, number[]>, line: number, at: number) => {
    const values = map.get(line);
    if (values) values.push(at);
    else map.set(line, [at]);
  };
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      if (!has(x, y)) continue;
      const px = x + mask.x,
        py = y + mask.y;
      if (!has(x, y - 1)) add(horizontal, py, px);
      if (!has(x, y + 1)) add(horizontal, py + 1, px);
      if (!has(x - 1, y)) add(vertical, px, py);
      if (!has(x + 1, y)) add(vertical, px + 1, py);
    }
  const result: SelectionBoundarySegment[] = [];
  const merge = (values: Map<number, number[]>, axis: SelectionBoundarySegment["axis"]) => {
    for (const [line, starts] of values) {
      starts.sort((a, b) => a - b);
      let start = starts[0];
      let previous = starts[0];
      for (let index = 1; index <= starts.length; index++) {
        const next = starts[index];
        if (next === previous + 1) {
          previous = next;
          continue;
        }
        result.push(
          axis === "horizontal"
            ? { axis, x: start, y: line, length: previous - start + 1 }
            : { axis, x: line, y: start, length: previous - start + 1 },
        );
        start = next;
        previous = next;
      }
    }
  };
  merge(horizontal, "horizontal");
  merge(vertical, "vertical");
  return result;
}

/** Project cached document edges to integer logical GUI pixels. */
export function projectSelectionBoundarySegments(
  segments: readonly SelectionBoundarySegment[],
  origin: Point,
  zoom: number,
): SelectionBoundarySegment[] {
  if (!Number.isFinite(zoom) || zoom <= 0) return [];
  const projected: SelectionBoundarySegment[] = [];
  for (const segment of segments) {
    if (segment.axis === "horizontal") {
      const x = Math.trunc(origin.x + segment.x * zoom);
      const end = Math.trunc(origin.x + (segment.x + segment.length) * zoom);
      const length = end - x;
      if (length > 0)
        projected.push({
          axis: segment.axis,
          x,
          y: Math.trunc(origin.y + segment.y * zoom),
          length,
        });
    } else {
      const y = Math.trunc(origin.y + segment.y * zoom);
      const end = Math.trunc(origin.y + (segment.y + segment.length) * zoom);
      const length = end - y;
      if (length > 0)
        projected.push({
          axis: segment.axis,
          x: Math.trunc(origin.x + segment.x * zoom),
          y,
          length,
        });
    }
  }
  return projected;
}

/** Position the selection shader in the scrollable editor widget. Padding
 * follows LibreSprite GPLv2 Editor::calcExtraPadding; path paint is MIT UI. */
export function selectionShaderOffset(
  viewport: { width: number; height: number },
  document: { width: number; height: number },
  zoom: number,
  origin: Point,
): Point {
  return {
    x:
      Math.max(Math.trunc(viewport.width / 2), viewport.width - Math.trunc(document.width * zoom)) -
      origin.x,
    y:
      Math.max(
        Math.trunc(viewport.height / 2),
        viewport.height - Math.trunc(document.height * zoom),
      ) - origin.y,
  };
}

/** Eight-pixel checker phase follows the MIT-licensed UI library. */
export function asepriteSelectionBoundaryWhite(x: number, y: number, antsOffset: number): boolean {
  const offset = 7 - (antsOffset & 7);
  return ((x + y + offset) & 7) < 4;
}

export function selectionBoundaryContains(m: PixelMask, local: Point, tolerance: number): boolean {
  const has = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < m.width && y < m.height && !!m.data[y * m.width + x];
  const minx = Math.max(0, Math.floor(local.x - m.x - tolerance)),
    maxx = Math.min(m.width - 1, Math.floor(local.x - m.x + tolerance)),
    miny = Math.max(0, Math.floor(local.y - m.y - tolerance)),
    maxy = Math.min(m.height - 1, Math.floor(local.y - m.y + tolerance));
  for (let y = miny; y <= maxy; y++)
    for (let x = minx; x <= maxx; x++)
      if (has(x, y)) {
        const px = m.x + x,
          py = m.y + y;
        if (
          (!has(x - 1, y) && Math.abs(local.x - px) <= tolerance) ||
          (!has(x + 1, y) && Math.abs(local.x - px - 1) <= tolerance) ||
          (!has(x, y - 1) && Math.abs(local.y - py) <= tolerance) ||
          (!has(x, y + 1) && Math.abs(local.y - py - 1) <= tolerance)
        )
          return true;
      }
  return false;
}
