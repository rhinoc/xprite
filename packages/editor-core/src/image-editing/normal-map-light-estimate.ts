import { UINT8_MAX, type PixelBuffer } from "$/base";
import { lightingMapLuminance } from "$/image-editing/lighting-map-source";

const RGBA_CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const SOLID_ALPHA = 128;
const NEUTRAL_SHADE = 0.5;
const MIN_VISIBLE_CHANNEL = 20;
const CONTOUR_DEPTH = 4;
const DISTANCE_CAP = CONTOUR_DEPTH + 3;
const SMOOTH_CENTER_WEIGHT = 2;
const MIN_SLOPE = 0.15;
const MIN_COMPONENT_PIXELS = 24;
const MIN_FIT_PIXELS = 40;
const MIN_GROUP_PIXELS = 8;
const CHROMA_STEPS = 16;
const CHROMA_BUCKETS = CHROMA_STEPS + 1;
const TONE_STEPS = 32;
const MIN_TONE_PIXELS = 2;
const MIN_TONES = 3;
const MIN_CONTRAST = 0.025;
const MIN_FIT = 0.65;
const MIN_OPPOSITE_MARGIN = 0.2;
const MIN_COMPONENT_FIT = 0.25;
const MAX_HOLDOUT_DRIFT = 25;
const MAX_COMPONENT_DRIFT = 45;
const HOLDOUT_COUNT = 4;
const MIN_TILE_SIZE = 4;
const TILES_PER_SPRITE = 5;
const BLOCK_ROW_STEP = 7;
const FULL_TURN = 360;
const HALF_TURN = FULL_TURN / 2;
const ANGLE_STEP = 5;
const ANGLE_COUNT = FULL_TURN / ANGLE_STEP;
const ELEVATIONS = [25, 45, 65];
const RAD_PER_DEGREE = Math.PI / 180;
const MAX_ESTIMATE_PIXELS = 1_048_576;
const MAX_SAMPLES = 8_192;
const FIT_EPSILON = 1e-9;
const CARDINAL_STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;
const CHAMFER_STEPS = [
  [-1, 0, 1],
  [0, -1, 1],
  [-1, -1, Math.SQRT2],
  [1, -1, Math.SQRT2],
] as const;

interface Sample {
  nx: number;
  ny: number;
  nz: number;
  luminance: number;
  component: number;
  group: number;
  block: number;
}

function silhouette(source: PixelBuffer) {
  const { width, height, data } = source;
  const count = width * height;
  const mask = new Uint8Array(count);
  let area = 0;
  let left = width;
  let top = height;
  for (let i = 0; i < count; i++) {
    if (data[i * RGBA_CHANNELS + ALPHA_CHANNEL] < SOLID_ALPHA) continue;
    mask[i] = 1;
    area++;
    left = Math.min(left, i % width);
    top = Math.min(top, Math.floor(i / width));
  }
  const indexAt = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height ? y * width + x : -1;
  const distance = new Float32Array(count);
  const labels = new Int32Array(count).fill(-1);
  const componentSizes: number[] = [];
  const queue = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    distance[i] = CARDINAL_STEPS.some(([dx, dy]) => !mask[indexAt(x + dx, y + dy)])
      ? 1
      : DISTANCE_CAP;
    if (labels[i] >= 0) continue;
    const label = componentSizes.length;
    queue[0] = i;
    labels[i] = label;
    let length = 1;
    for (let head = 0; head < length; head++) {
      const p = queue[head];
      for (const [dx, dy] of CARDINAL_STEPS) {
        const next = indexAt((p % width) + dx, Math.floor(p / width) + dy);
        if (!mask[next] || labels[next] >= 0) continue;
        labels[next] = label;
        queue[length++] = next;
      }
    }
    componentSizes.push(length);
  }
  // Two bounded chamfer passes cover the contour band used for fitting.
  for (const sign of [1, -1]) {
    for (let step = 0; step < count; step++) {
      const i = sign === 1 ? step : count - 1 - step;
      if (!mask[i] || distance[i] === 1) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [dx, dy, cost] of CHAMFER_STEPS) {
        const next = indexAt(x + dx * sign, y + dy * sign);
        if (mask[next]) distance[i] = Math.min(distance[i], distance[next] + cost);
      }
    }
  }
  const smooth = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (!mask[i]) continue;
    let sum = distance[i] * SMOOTH_CENTER_WEIGHT;
    let weight = SMOOTH_CENTER_WEIGHT;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [dx, dy] of CARDINAL_STEPS) {
      const next = indexAt(x + dx, y + dy);
      if (!mask[next]) continue;
      sum += distance[next];
      weight++;
    }
    smooth[i] = sum / weight;
  }
  return { area, left, top, mask, distance, smooth, labels, componentSizes, indexAt };
}

function fitDirection(samples: readonly Sample[]) {
  if (samples.length < MIN_FIT_PIXELS) return null;
  const byGroup = new Map<number, Sample[]>();
  for (const sample of samples) {
    const group = byGroup.get(sample.group);
    if (group) group.push(sample);
    else byGroup.set(sample.group, [sample]);
  }
  const groups = [...byGroup.values()].map((samples) => {
    const count = samples.length;
    const mean = samples.reduce((sum, sample) => sum + sample.luminance, 0) / count;
    const residuals = samples.map((sample) => sample.luminance - mean);
    return { samples, residuals, weight: 1 / Math.sqrt(count) };
  });
  const observedVariance = groups.reduce(
    (sum, group) => sum + group.weight * group.residuals.reduce((s, r) => s + r * r, 0),
    0,
  );
  if (observedVariance <= FIT_EPSILON) return null;
  const scores = new Float64Array(ANGLE_COUNT).fill(-1);
  let winner = 0;
  for (let slot = 0; slot < ANGLE_COUNT; slot++) {
    const angle = slot * ANGLE_STEP * RAD_PER_DEGREE;
    for (const elevation of ELEVATIONS) {
      const height = elevation * RAD_PER_DEGREE;
      const lx = Math.cos(angle) * Math.cos(height);
      const ly = Math.sin(angle) * Math.cos(height);
      const lz = Math.sin(height);
      let predictedVariance = 0;
      let covariance = 0;
      for (const { samples, residuals, weight } of groups) {
        let sum = 0;
        let squared = 0;
        let cross = 0;
        for (let i = 0; i < samples.length; i++) {
          const { nx, ny, nz } = samples[i];
          const prediction = Math.max(0, nx * lx + ny * ly + nz * lz);
          sum += prediction;
          squared += prediction * prediction;
          cross += prediction * residuals[i];
        }
        predictedVariance += weight * (squared - (sum * sum) / samples.length);
        covariance += weight * cross;
      }
      if (predictedVariance > FIT_EPSILON)
        scores[slot] = Math.max(
          scores[slot],
          covariance / Math.sqrt(predictedVariance * observedVariance),
        );
    }
    if (scores[slot] > scores[winner]) winner = slot;
  }
  return {
    angle: winner * ANGLE_STEP,
    fit: scores[winner],
    oppositeMargin: scores[winner] - scores[(winner + ANGLE_COUNT / 2) % ANGLE_COUNT],
  };
}

function angularDistance(a: number, b: number): number {
  return Math.abs(((a - b + FULL_TURN + HALF_TURN) % FULL_TURN) - HALF_TURN);
}

/** Estimate an image-plane azimuth from contour shading. Null leaves the draft angle alone. */
export function estimatePaintedLightAngle(
  source: PixelBuffer,
  shading?: PixelBuffer,
): number | null {
  const { width, height, data } = source;
  if (width * height > MAX_ESTIMATE_PIXELS) return null;
  if (shading && (shading.width !== width || shading.height !== height)) return null;
  const { area, left, top, mask, distance, smooth, labels, componentSizes, indexAt } =
    silhouette(source);
  if (area < MIN_FIT_PIXELS) return null;
  const tileSize = Math.max(MIN_TILE_SIZE, Math.floor(Math.sqrt(area) / TILES_PER_SPRITE));
  const samples: Sample[] = [];
  for (let i = 0; i < mask.length; i++) {
    const component = labels[i];
    if (!mask[i] || distance[i] > CONTOUR_DEPTH || componentSizes[component] < MIN_COMPONENT_PIXELS)
      continue;
    const x = i % width;
    const y = Math.floor(i / width);
    const sampleAt = (x: number, y: number) => smooth[indexAt(x, y)] ?? 0;
    const nx = (sampleAt(x - 1, y) - sampleAt(x + 1, y)) / 2;
    const ny = (sampleAt(x, y + 1) - sampleAt(x, y - 1)) / 2;
    const length = Math.hypot(nx, ny, 1);
    if (Math.hypot(nx, ny) / length < MIN_SLOPE) continue;
    const at = i * RGBA_CHANNELS;
    let group = component;
    let luminance = lightingMapLuminance(data, at);
    if (shading) {
      const alpha = shading.data[at + ALPHA_CHANNEL] / UINT8_MAX;
      luminance = NEUTRAL_SHADE + alpha * (lightingMapLuminance(shading.data, at) - NEUTRAL_SHADE);
    } else {
      if (Math.max(data[at], data[at + 1], data[at + 2]) < MIN_VISIBLE_CHANNEL) continue;
      const sum = data[at] + data[at + 1] + data[at + 2];
      const red = Math.round((data[at] / sum) * CHROMA_STEPS);
      const green = Math.round((data[at + 1] / sum) * CHROMA_STEPS);
      group = (component * CHROMA_BUCKETS + red) * CHROMA_BUCKETS + green;
    }
    const block =
      (Math.floor((y - top) / tileSize) * BLOCK_ROW_STEP + Math.floor((x - left) / tileSize)) %
      HOLDOUT_COUNT;
    samples.push({
      nx: nx / length,
      ny: ny / length,
      nz: 1 / length,
      luminance,
      component,
      group,
      block,
    });
  }
  const bounded =
    samples.length <= MAX_SAMPLES
      ? samples
      : Array.from(
          { length: MAX_SAMPLES },
          (_, i) => samples[Math.floor((i * samples.length) / MAX_SAMPLES)],
        );
  const byGroup = new Map<number, Sample[]>();
  for (const sample of bounded) {
    const group = byGroup.get(sample.group);
    if (group) group.push(sample);
    else byGroup.set(sample.group, [sample]);
  }
  const supported: Sample[] = [];
  let contrast = 0;
  for (const group of byGroup.values()) {
    if (group.length < MIN_GROUP_PIXELS) continue;
    const tones = new Uint16Array(TONE_STEPS + 1);
    for (const sample of group) tones[Math.round(sample.luminance * TONE_STEPS)]++;
    if (tones.filter((tone) => tone >= MIN_TONE_PIXELS).length < MIN_TONES) continue;
    const mean = group.reduce((sum, sample) => sum + sample.luminance, 0) / group.length;
    for (const sample of group) {
      contrast += (sample.luminance - mean) ** 2;
      supported.push(sample);
    }
  }
  if (supported.length < MIN_FIT_PIXELS || contrast < supported.length * MIN_CONTRAST ** 2)
    return null;
  const candidate = fitDirection(supported);
  if (!candidate || candidate.fit < MIN_FIT || candidate.oppositeMargin < MIN_OPPOSITE_MARGIN)
    return null;
  for (let block = 0; block < HOLDOUT_COUNT; block++) {
    const fit = fitDirection(supported.filter((sample) => sample.block !== block));
    if (!fit || angularDistance(fit.angle, candidate.angle) > MAX_HOLDOUT_DRIFT) return null;
  }
  const byComponent = new Map<number, Sample[]>();
  for (const sample of supported) {
    const component = byComponent.get(sample.component);
    if (component) component.push(sample);
    else byComponent.set(sample.component, [sample]);
  }
  for (const component of byComponent.values()) {
    const fit = fitDirection(component);
    if (
      fit &&
      fit.fit >= MIN_COMPONENT_FIT &&
      angularDistance(fit.angle, candidate.angle) > MAX_COMPONENT_DRIFT
    )
      return null;
  }
  return candidate.angle;
}
