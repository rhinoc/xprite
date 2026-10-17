import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import type { PixelGridAnalysis } from "$/import-export/image/import/types";

// Inspired by KenneyJAllen/proper-pixel-art (MIT License)
// https://github.com/KennethJAllen/proper-pixel-art
// This implementation focuses on edge-based grid detection for upscaled pixel art
// and AI-generated pixel art with jittered cell sizes.

const CHANNELS = 4;
const EDGE_SOBEL_THRESHOLD = 0.1;
const GAP_CLOSE_MAX = 3;
const MIN_EDGES_PER_AXIS = 8;
const MAX_CELL_SIZE = 128;
const MIN_CELL_SIZE = 2;
const MIN_CONFIDENCE = 0.5;
const JITTER_TOLERANCE = 0.2;
const MEDIAN_TRIM_FRACTION = 0.15;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EdgeMap {
  width: number;
  height: number;
  horizontal: Uint8Array;
  vertical: Uint8Array;
}

function trimMargins(image: PixelBuffer): Rect {
  const { width, height, data } = image;
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  const isNonEmpty = (offset: number): boolean => {
    const a = data[offset + 3];
    if (a === 0) return false;
    const r = data[offset],
      g = data[offset + 1],
      b = data[offset + 2];
    return r !== g || g !== b || Math.abs(r - 128) > 8;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isNonEmpty((y * width + x) * CHANNELS)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY)
    return { x: 0, y: 0, width: Math.min(32, width), height: Math.min(32, height) };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function sobelEdgeDetection(image: PixelBuffer, bounds: Rect): EdgeMap {
  const { data } = image;
  const { x, y, width, height } = bounds;
  const horizontal = new Uint8Array(width * height);
  const vertical = new Uint8Array(width * height);
  const getGray = (px: number, py: number): number => {
    if (px < x || px >= x + width || py < y || py >= y + height) return 0;
    const offset = (py * image.width + px) * CHANNELS;
    const r = data[offset],
      g = data[offset + 1],
      b = data[offset + 2],
      a = data[offset + 3];
    return a === 0 ? 0 : (r * 0.299 + g * 0.587 + b * 0.114) / UINT8_MAX;
  };
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const cx = x + dx,
        cy = y + dy;
      const gx =
        -getGray(cx - 1, cy - 1) -
        2 * getGray(cx - 1, cy) -
        getGray(cx - 1, cy + 1) +
        getGray(cx + 1, cy - 1) +
        2 * getGray(cx + 1, cy) +
        getGray(cx + 1, cy + 1);
      const gy =
        -getGray(cx - 1, cy - 1) -
        2 * getGray(cx, cy - 1) -
        getGray(cx + 1, cy - 1) +
        getGray(cx - 1, cy + 1) +
        2 * getGray(cx, cy + 1) +
        getGray(cx + 1, cy + 1);
      const magnitude = Math.hypot(gx, gy);
      const threshold = magnitude > EDGE_SOBEL_THRESHOLD ? 1 : 0;
      horizontal[dy * width + dx] = Math.abs(gy) > Math.abs(gx) ? threshold : 0;
      vertical[dy * width + dx] = Math.abs(gx) >= Math.abs(gy) ? threshold : 0;
    }
  }
  return { width, height, horizontal, vertical };
}

function closeGaps(edges: Uint8Array, length: number, stride: number): void {
  for (let i = 0; i < length; i++) {
    let gap = 0,
      start = -1;
    for (let j = 0; j < stride; j++) {
      const index = i + j * length;
      if (edges[index]) {
        if (gap > 0 && gap <= GAP_CLOSE_MAX && start >= 0) {
          for (let k = start; k < j; k++) edges[i + k * length] = 1;
        }
        gap = 0;
        start = j;
      } else if (start >= 0) {
        gap++;
      }
    }
  }
}

function projectEdges(edges: Uint8Array, length: number, stride: number): number[] {
  const projection = new Array(stride).fill(0);
  for (let i = 0; i < stride; i++)
    for (let j = 0; j < length; j++) if (edges[i * length + j]) projection[i]++;
  return projection;
}

function detectPeaks(projection: number[]): number[] {
  const mean = projection.reduce((a, b) => a + b, 0) / projection.length;
  const threshold = mean * 0.5;
  const peaks: number[] = [];
  for (let i = 1; i < projection.length - 1; i++)
    if (projection[i] > threshold && projection[i] >= projection[i - 1] && projection[i] > projection[i + 1])
      peaks.push(i);
  return peaks;
}

function estimatePitch(peaks: number[]): { pitch: number; confidence: number } | null {
  if (peaks.length < MIN_EDGES_PER_AXIS) return null;
  const spacings: number[] = [];
  for (let i = 1; i < peaks.length; i++) spacings.push(peaks[i] - peaks[i - 1]);
  spacings.sort((a, b) => a - b);
  const trimCount = Math.floor(spacings.length * MEDIAN_TRIM_FRACTION);
  const trimmed = spacings.slice(trimCount, spacings.length - trimCount);
  if (!trimmed.length) return null;
  const median = trimmed[Math.floor(trimmed.length / 2)];
  if (median < MIN_CELL_SIZE || median > MAX_CELL_SIZE) return null;
  const jitterMax = median * JITTER_TOLERANCE;
  const consistent = trimmed.filter((s) => Math.abs(s - median) <= jitterMax).length;
  const confidence = consistent / trimmed.length;
  return confidence >= 0.5 ? { pitch: median, confidence } : null;
}

function buildCuts(peaks: number[], pitch: number, length: number): number[] {
  if (!peaks.length) return [0, length];
  const cuts = [0];
  let expected = peaks[0];
  for (const peak of peaks) {
    if (peak >= expected - pitch * JITTER_TOLERANCE && peak <= expected + pitch * JITTER_TOLERANCE) {
      if (peak > cuts[cuts.length - 1]) cuts.push(peak);
      expected = peak + pitch;
    }
  }
  cuts.push(length);
  return cuts;
}

export function detectEdgeBasedGrid(image: PixelBuffer): PixelGridAnalysis {
  assertPixelBuffer(image);
  const bounds = trimMargins(image);
  if (bounds.width < MIN_CELL_SIZE * 4 || bounds.height < MIN_CELL_SIZE * 4)
    return { width: 1, height: 1, cellWidth: image.width, cellHeight: image.height, offsetX: 0, offsetY: 0, confidence: 0, reliable: false };
  const edges = sobelEdgeDetection(image, bounds);
  closeGaps(edges.horizontal, edges.width, edges.height);
  closeGaps(edges.vertical, edges.height, edges.width);
  const horizontalProj = projectEdges(edges.horizontal, edges.width, edges.height);
  const verticalProj = projectEdges(edges.vertical, edges.height, edges.width);
  const horizontalPeaks = detectPeaks(horizontalProj);
  const verticalPeaks = detectPeaks(verticalProj);
  const horizontalPitch = estimatePitch(horizontalPeaks);
  const verticalPitch = estimatePitch(verticalPeaks);
  if (!horizontalPitch || !verticalPitch)
    return { width: 1, height: 1, cellWidth: image.width, cellHeight: image.height, offsetX: 0, offsetY: 0, confidence: 0, reliable: false };
  const xCuts = buildCuts(verticalPeaks, verticalPitch.pitch, edges.width);
  const yCuts = buildCuts(horizontalPeaks, horizontalPitch.pitch, edges.height);
  const width = xCuts.length - 1;
  const height = yCuts.length - 1;
  if (width < 4 || height < 4)
    return { width: 1, height: 1, cellWidth: image.width, cellHeight: image.height, offsetX: 0, offsetY: 0, confidence: 0, reliable: false };
  const confidence = Math.min(horizontalPitch.confidence, verticalPitch.confidence);
  const reliable = confidence >= MIN_CONFIDENCE;
  return {
    width,
    height,
    cellWidth: verticalPitch.pitch,
    cellHeight: horizontalPitch.pitch,
    offsetX: bounds.x + (xCuts[0] ?? 0),
    offsetY: bounds.y + (yCuts[0] ?? 0),
    confidence,
    reliable,
  };
}
