import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import { pixelGridCuts } from "$/import-export/image/import/grid";
import type { PixelGridAnalysis } from "$/import-export/image/import/types";

// Inspired by KennethJAllen/proper-pixel-art (MIT License)
// https://github.com/KennethJAllen/proper-pixel-art

const CHANNELS = 4;
const EDGE_THRESHOLD = 10 / UINT8_MAX;
const MIN_EDGES = 8;
const MAX_CELL_SIZE = 128;
const MIN_CELL_SIZE = 2;
const MAX_GRID_SIZE = 512;
const SPACING_TOLERANCE = 0.25;

function colorDifference(image: PixelBuffer, first: number, second: number): number {
  const { data } = image;
  const a = data[first + 3] / UINT8_MAX,
    b = data[second + 3] / UINT8_MAX;
  let difference = Math.abs(a - b);
  for (let c = 0; c < CHANNELS - 1; c++)
    difference = Math.max(
      difference,
      Math.abs(data[first + c] * a - data[second + c] * b) / UINT8_MAX,
    );
  return difference;
}

function findEdges(image: PixelBuffer, horizontal: boolean): number[] {
  const length = horizontal ? image.width : image.height;
  const cross = horizontal ? image.height : image.width;
  const edgeStrength = new Float64Array(length);

  for (let line = 0; line < cross; line++) {
    for (let position = 1; position < length; position++) {
      const first =
        (horizontal ? line * image.width + position - 1 : (position - 1) * image.width + line) *
        CHANNELS;
      const second = first + (horizontal ? CHANNELS : image.width * CHANNELS);
      edgeStrength[position] += colorDifference(image, first, second);
    }
  }

  const edges: number[] = [];
  const mean = edgeStrength.reduce((a, b) => a + b, 0) / length;
  const threshold = Math.max(EDGE_THRESHOLD * cross, mean * 0.8);

  for (let i = 1; i < length - 1; i++) {
    if (
      edgeStrength[i] >= threshold &&
      edgeStrength[i] >= edgeStrength[i - 1] &&
      edgeStrength[i] >= edgeStrength[i + 1]
    ) {
      edges.push(i);
    }
  }

  return edges;
}

function analyzeSpacing(edges: number[]): { spacing: number; confidence: number } | null {
  if (edges.length < MIN_EDGES) return null;

  const spacings: number[] = [];
  for (let i = 1; i < edges.length; i++) {
    spacings.push(edges[i] - edges[i - 1]);
  }

  spacings.sort((a, b) => a - b);
  const median = spacings[Math.floor(spacings.length / 2)];

  if (median < MIN_CELL_SIZE || median > MAX_CELL_SIZE) return null;

  const tolerance = median * SPACING_TOLERANCE;
  const consistent = spacings.filter((s) => Math.abs(s - median) <= tolerance);
  const confidence = consistent.length / spacings.length;

  if (confidence < 0.5) return null;

  const avgSpacing = consistent.reduce((a, b) => a + b, 0) / consistent.length;
  return { spacing: avgSpacing, confidence };
}

export function detectEdgeBasedGrid(image: PixelBuffer): PixelGridAnalysis {
  assertPixelBuffer(image);

  const horizontalEdges = findEdges(image, true);
  const verticalEdges = findEdges(image, false);

  const hResult = analyzeSpacing(horizontalEdges);
  const vResult = analyzeSpacing(verticalEdges);

  if (!hResult || !vResult) {
    return {
      width: 1,
      height: 1,
      cellWidth: image.width,
      cellHeight: image.height,
      offsetX: 0,
      offsetY: 0,
      confidence: 0,
      reliable: false,
    };
  }

  const xCuts = pixelGridCuts(image.width, vResult.spacing, verticalEdges[0] ?? 0);
  const yCuts = pixelGridCuts(image.height, hResult.spacing, horizontalEdges[0] ?? 0);

  const width = xCuts.length - 1;
  const height = yCuts.length - 1;

  if (width < 4 || height < 4 || width > MAX_GRID_SIZE || height > MAX_GRID_SIZE) {
    return {
      width: 1,
      height: 1,
      cellWidth: image.width,
      cellHeight: image.height,
      offsetX: 0,
      offsetY: 0,
      confidence: 0,
      reliable: false,
    };
  }

  const confidence = Math.min(hResult.confidence, vResult.confidence);
  const reliable = confidence >= 0.6;

  return {
    width,
    height,
    cellWidth: vResult.spacing,
    cellHeight: hResult.spacing,
    offsetX: verticalEdges[0] ?? 0,
    offsetY: horizontalEdges[0] ?? 0,
    confidence,
    reliable,
  };
}
