import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import { PixelArtClassification } from "$/import-export/image/import/types";
import type {
  PixelArtAnalysis,
  PixelArtAnalysisOptions,
  PixelArtMetrics,
} from "$/import-export/image/import/types";
import { clamp } from "@xprite/bedrock/common/clamp";

const MAX_UNIQUE_SAMPLE_COLORS = 8_192;
const DEFAULT_MAX_SAMPLE_PIXELS = 131_072;

function classificationFor(score: number): PixelArtClassification {
  if (score >= 0.24) return PixelArtClassification.LikelyPixelArt;
  if (score <= -0.24) return PixelArtClassification.LikelyPhoto;
  return PixelArtClassification.Uncertain;
}

function checkedMaxSamples(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_SAMPLE_PIXELS;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError("maxSamplePixels must be a positive integer");
  return value;
}

/**
 * Estimate whether imported RGBA pixels resemble pixel art or a photograph.
 * This is intentionally a suggestion: callers should expose the result and
 * keep the user's override when the heuristic is wrong.
 */
export function analyzePixelArt(
  image: PixelBuffer,
  options: PixelArtAnalysisOptions = {},
): PixelArtAnalysis {
  assertPixelBuffer(image);
  const maxSamples = checkedMaxSamples(options.maxSamplePixels);
  const totalPixels = image.width * image.height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(totalPixels / maxSamples)));
  const data = image.data;
  const unique = new Set<number>();
  const histogram = new Uint32Array(32 * 32 * 32);
  let sampledPixels = 0;
  let transparentPixels = 0;
  let opaquePixels = 0;
  let entropyTotal = 0;

  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const offset = (y * image.width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      sampledPixels += 1;
      if (a === 0) transparentPixels += 1;
      if (a === UINT8_MAX) opaquePixels += 1;
      if (unique.size <= MAX_UNIQUE_SAMPLE_COLORS)
        unique.add((r << 24) | (g << 16) | (b << 8) | a | 0);
      histogram[(r >>> 3) | ((g >>> 3) << 5) | ((b >>> 3) << 10)] += 1;
    }
  }

  let exactNeighbors = 0;
  let nearNeighbors = 0;
  let neighborComparisons = 0;
  const isNear = (left: number, right: number): boolean => {
    const dr = Math.abs(data[left] - data[right]);
    const dg = Math.abs(data[left + 1] - data[right + 1]);
    const db = Math.abs(data[left + 2] - data[right + 2]);
    const da = Math.abs(data[left + 3] - data[right + 3]);
    return dr <= 12 && dg <= 12 && db <= 12 && da <= 24;
  };
  const isExact = (left: number, right: number): boolean =>
    data[left] === data[right] &&
    data[left + 1] === data[right + 1] &&
    data[left + 2] === data[right + 2] &&
    data[left + 3] === data[right + 3];

  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const offset = (y * image.width + x) * 4;
      if (x + stride < image.width) {
        const right = (y * image.width + x + stride) * 4;
        neighborComparisons += 1;
        if (isExact(offset, right)) exactNeighbors += 1;
        if (isNear(offset, right)) nearNeighbors += 1;
      }
      if (y + stride < image.height) {
        const below = ((y + stride) * image.width + x) * 4;
        neighborComparisons += 1;
        if (isExact(offset, below)) exactNeighbors += 1;
        if (isNear(offset, below)) nearNeighbors += 1;
      }
    }
  }

  for (let i = 0; i < histogram.length; i += 1) {
    if (histogram[i] === 0) continue;
    const probability = histogram[i] / sampledPixels;
    entropyTotal -= probability * Math.log2(probability);
  }

  const uniqueColorsCapped = unique.size > MAX_UNIQUE_SAMPLE_COLORS;
  const uniqueColors = uniqueColorsCapped ? MAX_UNIQUE_SAMPLE_COLORS + 1 : unique.size;
  const uniqueColorRatio = clamp(uniqueColors / sampledPixels, 0, 1);
  const exactNeighborRatio = neighborComparisons === 0 ? 1 : exactNeighbors / neighborComparisons;
  const nearNeighborRatio = neighborComparisons === 0 ? 1 : nearNeighbors / neighborComparisons;
  const edgeDensity = 1 - nearNeighborRatio;
  const transparentRatio = transparentPixels / sampledPixels;
  const opaqueRatio = opaquePixels / sampledPixels;
  const metrics: PixelArtMetrics = {
    width: image.width,
    height: image.height,
    sampledPixels,
    uniqueColors,
    uniqueColorsCapped,
    uniqueColorRatio,
    exactNeighborRatio,
    nearNeighborRatio,
    edgeDensity,
    colorEntropy: entropyTotal,
    transparentRatio,
    opaqueRatio,
  };

  let score = 0;
  const evidence: string[] = [];
  const maxDimension = Math.max(image.width, image.height);
  if (maxDimension <= 64) {
    score += 0.3;
    evidence.push("Small canvas dimensions are common in sprites and tiles.");
  } else if (maxDimension <= 160) {
    score += 0.16;
    evidence.push("The canvas is small enough to be consistent with a sprite.");
  } else if (maxDimension >= 1024) {
    score -= 0.14;
    evidence.push("Large canvas dimensions are more common in photographic imports.");
  }

  if (uniqueColorRatio <= 0.05) {
    score += 0.32;
    evidence.push("Most sampled pixels come from a small discrete palette.");
  } else if (uniqueColorRatio <= 0.18) {
    score += 0.13;
    evidence.push("The sampled palette is moderately compact.");
  } else if (uniqueColorRatio >= 0.65) {
    score -= 0.3;
    evidence.push("Many sampled pixels have distinct colors, which is common in photos.");
  }

  if (exactNeighborRatio >= 0.45) {
    score += 0.22;
    evidence.push("Neighboring pixels often repeat exactly, a common pixel-art signal.");
  } else if (exactNeighborRatio <= 0.06 && edgeDensity > 0.55) {
    score -= 0.16;
    evidence.push("Neighbors change frequently without forming large repeated runs.");
  }

  if (nearNeighborRatio >= 0.72 && exactNeighborRatio < 0.2) {
    score -= 0.12;
    evidence.push("Many neighbors are only slightly different, suggesting smooth tone changes.");
  } else if (nearNeighborRatio <= 0.35 && uniqueColorRatio <= 0.25) {
    score += 0.1;
    evidence.push("Color changes are crisp while the palette remains compact.");
  }

  if (entropyTotal <= 3.5) {
    score += 0.12;
    evidence.push("Color entropy is low.");
  } else if (entropyTotal >= 7.5) {
    score -= 0.1;
    evidence.push("Color entropy is high.");
  }
  if (transparentRatio >= 0.05) {
    score += 0.08;
    evidence.push("Transparency is present, which is common for sprites and cutouts.");
  }

  score = clamp(score, -1, 1);
  const suggestedClassification = classificationFor(score);
  const requestedOverride = options.userOverride;
  if (
    requestedOverride !== undefined &&
    requestedOverride !== null &&
    ![
      PixelArtClassification.LikelyPixelArt,
      PixelArtClassification.LikelyPhoto,
      PixelArtClassification.Uncertain,
    ].includes(requestedOverride)
  ) {
    throw new RangeError("userOverride must be a valid PixelArtClassification");
  }
  const userOverride = requestedOverride ?? null;
  const overrideApplied = userOverride !== null;
  const classification = userOverride ?? suggestedClassification;
  if (overrideApplied) evidence.push(`User override retained: ${userOverride}.`);
  return {
    classification,
    suggestedClassification,
    confidence: overrideApplied ? 1 : clamp(0.5 + Math.abs(score) * 0.5, 0, 0.99),
    score,
    evidence,
    metrics,
    userOverride,
    overrideApplied,
    isHeuristic: true,
  };
}
