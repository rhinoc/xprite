import type { PixelBuffer } from "@xprite/editor-core/base";
import { validTimelineRange, type SpriteTimeline } from "@xprite/editor-core/timeline";

export enum NormalMapFrameScope {
  All = "all",
  Selected = "selected",
  Current = "current",
}
export type NormalMapRememberedFrameScope = NormalMapFrameScope.All | NormalMapFrameScope.Current;
export const NORMAL_FRAME_TAG_PREFIX = "tag:";
export interface NormalMapTagRange {
  name: string;
  from: number;
  to: number;
}
export interface NormalMapBatchFrameResult {
  frame: number;
  source: PixelBuffer;
  pixels: PixelBuffer | null;
}
export interface NormalMapCachedPreview {
  source: PixelBuffer;
  shading: PixelBuffer | null;
  output: PixelBuffer;
}

const ALPHA_CHANNEL_OFFSET = 3;
const RGBA_STRIDE = 4;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const HASH_STRIDE = 16;

function abortError(): DOMException {
  return new DOMException("Batch generation cancelled", "AbortError");
}

export function isNormalMapRememberedFrameScope(
  value: unknown,
): value is NormalMapRememberedFrameScope {
  return value === NormalMapFrameScope.All || value === NormalMapFrameScope.Current;
}

export function resolveSelectedTimelineFrames(timeline: SpriteTimeline | undefined): number[] {
  if (!timeline?.range || !validTimelineRange(timeline, timeline.range)) return [];
  return [...timeline.range.frames].sort((a, b) => a - b);
}

export function initialNormalMapFrameScope(
  frameCount: number,
  selectedFrames: readonly number[],
  rememberedScope: NormalMapRememberedFrameScope,
): string {
  if (frameCount <= 1) return NormalMapFrameScope.Current;
  if (selectedFrames.length > 1) return NormalMapFrameScope.Selected;
  return rememberedScope;
}

export function resolveNormalMapFrames(
  scope: string,
  frameCount: number,
  activeFrame: number,
  selectedFrames: readonly number[],
  tags: readonly NormalMapTagRange[],
): number[] {
  if (frameCount <= 0) return [];
  const clampedActive = Math.max(0, Math.min(frameCount - 1, activeFrame));
  if (scope === NormalMapFrameScope.All)
    return Array.from({ length: frameCount }, (_, index) => index);
  if (scope === NormalMapFrameScope.Selected) {
    const valid = [
      ...new Set(selectedFrames.filter((frame) => frame >= 0 && frame < frameCount)),
    ].sort((a, b) => a - b);
    return valid.length ? valid : [clampedActive];
  }
  if (scope.startsWith(NORMAL_FRAME_TAG_PREFIX)) {
    const tagName = scope.slice(NORMAL_FRAME_TAG_PREFIX.length);
    const tag = tags.find((candidate) => candidate.name === tagName);
    if (tag) {
      const from = Math.max(0, Math.min(frameCount - 1, tag.from));
      const to = Math.max(from, Math.min(frameCount - 1, tag.to));
      return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
    }
  }
  return [clampedActive];
}

export function pickNormalMapPreviewFrame(
  frames: readonly number[],
  currentPreview: number,
  activeFrame: number,
): number {
  if (frames.includes(currentPreview)) return currentPreview;
  if (frames.includes(activeFrame)) return activeFrame;
  return frames[0] ?? activeFrame;
}

export function isPixelBufferTransparent(pixels: PixelBuffer): boolean {
  const { data } = pixels;
  for (let index = ALPHA_CHANNEL_OFFSET; index < data.length; index += RGBA_STRIDE)
    if (data[index] !== 0) return false;
  return true;
}

function pixelBuffersEqual(a: PixelBuffer | null, b: PixelBuffer | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length)
    return false;
  const left = a.data;
  const right = b.data;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
  return true;
}

function hashBuffer(hash: number, pixels: PixelBuffer | null): number {
  if (!pixels) return Math.imul(hash ^ 0, FNV_PRIME) >>> 0;
  let value = Math.imul(hash ^ pixels.width, FNV_PRIME) >>> 0;
  value = Math.imul(value ^ pixels.height, FNV_PRIME) >>> 0;
  const { data } = pixels;
  const step = Math.max(1, Math.floor(data.length / (HASH_STRIDE * RGBA_STRIDE)));
  for (let index = 0; index < data.length; index += step)
    value = Math.imul(value ^ data[index], FNV_PRIME) >>> 0;
  return value;
}

function pairKey(source: PixelBuffer, shading: PixelBuffer | null): number {
  return hashBuffer(hashBuffer(FNV_OFFSET_BASIS, source), shading);
}

export async function runNormalMapBatch({
  frames,
  renderFrame,
  cachedPreview,
  processFrame,
  signal,
  onProgress,
}: {
  frames: readonly number[];
  renderFrame: (frame: number) => { source: PixelBuffer; shading: PixelBuffer | null };
  cachedPreview?: NormalMapCachedPreview | null;
  processFrame: (source: PixelBuffer, shading: PixelBuffer | null) => Promise<PixelBuffer>;
  signal: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}): Promise<NormalMapBatchFrameResult[]> {
  const total = frames.length;
  const results: NormalMapBatchFrameResult[] = [];
  const cache = new Map<
    number,
    Array<{ source: PixelBuffer; shading: PixelBuffer | null; output: PixelBuffer }>
  >();
  if (cachedPreview) {
    const key = pairKey(cachedPreview.source, cachedPreview.shading);
    cache.set(key, [cachedPreview]);
  }
  let completed = 0;
  for (const frame of frames) {
    if (signal.aborted) throw abortError();
    const { source, shading } = renderFrame(frame);
    let pixels: PixelBuffer | null;
    if (isPixelBufferTransparent(source)) {
      pixels = null;
    } else {
      const key = pairKey(source, shading);
      const bucket = cache.get(key);
      const match = bucket?.find(
        (entry) =>
          pixelBuffersEqual(entry.source, source) && pixelBuffersEqual(entry.shading, shading),
      );
      if (match) {
        pixels = match.output;
      } else {
        pixels = await processFrame(source, shading);
        if (signal.aborted) throw abortError();
        if (bucket) bucket.push({ source, shading, output: pixels });
        else cache.set(key, [{ source, shading, output: pixels }]);
      }
    }
    results.push({ frame, source, pixels });
    completed += 1;
    onProgress?.(completed, total);
  }
  return results;
}
