import type { PixelBuffer } from "$/base/primitives";
import { MAX_GRID_CELL_SIZE, MAX_RECOVERED_GRID_SIZE } from "$/import-export/image/import/grid";

/**
 * Pitch search for upscaled pixel art whose edges are too soft for the edge-projection detectors
 * (bilinear upscales, blur, AI "mush"). It reads the energy of the slope and of the curvature
 * along each axis at several spans: a bilinear upscale is piecewise linear with a kink at every
 * cell boundary, and a blurred nearest upscale has a slope bump at every boundary, so the energy
 * profiles repeat with the cell pitch even when no single edge is sharp. The autocorrelation of that
 * profile peaks at the pitch and its multiples; aperiodic content (photos, gradients, vector
 * shapes) decays without a harmonic series.
 *
 * The search proposes pitches only. Phase and acceptance are decided by the arbiter, which scores
 * each candidate lattice on the input pixels.
 */
const CHANNELS = 4;
/** As the edge detectors: below three pixels a soft cell cannot be told from its blur. */
const MIN_PITCH = 3;
const MIN_CELLS = 4;
const MIN_GRID_CELLS = 16;
const MAX_SAMPLED_LINES = 384;
/** Lags beyond the pitch that the autocorrelation covers, so harmonics up to this order count. */
const HARMONIC_ORDERS = 6;
const PEAK_THRESHOLD = 0.1;
const HARMONIC_THRESHOLD = 0.06;
const MIN_HARMONICS = 2;
const HARMONIC_WINDOW = 0.12;
const HARMONIC_BONUS = 0.3;
const DUAL_AXIS_TOLERANCE = 0.12;
const MAX_CANDIDATES = 4;
/** A refined pitch this close to an integer also proposes the integer (integer upscales). */
const INTEGER_SNAP = 0.2;
/** A profile's span may reach at most this fraction of the pitch it proposes, inverted. */
const SPAN_REACH = 2;
const MAX_DIVISOR = 3;
const MAX_BASE_PITCHES = 4;
/** Pitches found by different spans within this relative distance are merged. */
const SAME_PITCH = 0.03;
/** Pitches within this relative distance of one already proposed are the same proposal. */
const DUPLICATE_PITCH = 0.004;

export interface PitchCandidate {
  pitch: number;
  strength: number;
}

/** Which difference a profile squares: the curvature, or the slope. */
enum ProfileOrder {
  Slope = 1,
  Curvature = 2,
}
/**
 * Profiles the search reads. Curvature finds the kinks of a bilinear upscale; slope finds a
 * blurred edge as one bump, where the curvature of the same ramp also repeats with the blur width.
 */
const PROFILES: readonly { order: ProfileOrder; span: number }[] = [
  { order: ProfileOrder.Curvature, span: 1 },
  { order: ProfileOrder.Curvature, span: 2 },
  { order: ProfileOrder.Curvature, span: 4 },
  { order: ProfileOrder.Curvature, span: 8 },
  { order: ProfileOrder.Slope, span: 1 },
  { order: ProfileOrder.Slope, span: 2 },
];

/**
 * profile[i] is the mean, over sampled lines across the axis, of the squared RGB difference of
 * the given order and span centred on pixel i. Taking the energy per line before averaging
 * keeps edges of opposite sign in different rows from cancelling. A wider span answers a soft
 * kink in proportion to the span while pixel noise stays flat, so large soft cells still show.
 */
function energyProfile(
  image: PixelBuffer,
  horizontal: boolean,
  order: ProfileOrder,
  span: number,
): Float64Array {
  const { width, height, data } = image;
  const length = horizontal ? width : height;
  const cross = horizontal ? height : width;
  const lineStride = Math.max(1, Math.floor(cross / MAX_SAMPLED_LINES));
  const unit = (horizontal ? 1 : width) * CHANNELS;
  const step = unit * span;
  const profile = new Float64Array(length);
  let lines = 0;
  for (let line = 0; line < cross; line += lineStride, lines++) {
    const start = (horizontal ? line * width : line) * CHANNELS;
    for (let i = span; i < length - span; i++) {
      const o = start + i * unit;
      let energy = 0;
      for (let c = 0; c < 3; c++) {
        const d =
          order === ProfileOrder.Curvature
            ? data[o + step + c] - 2 * data[o + c] + data[o - step + c]
            : data[o + step + c] - data[o - step + c];
        energy += d * d;
      }
      profile[i] += energy;
    }
  }
  for (let i = 0; i < length; i++) profile[i] /= lines;
  return profile;
}

function normalizedAutocorrelation(signal: Float64Array, maxLag: number): Float64Array {
  const n = signal.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;
  let energy = 0;
  const centred = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    centred[i] = signal[i] - mean;
    energy += centred[i] ** 2;
  }
  const result = new Float64Array(maxLag + 1);
  if (energy < 1e-12) return result;
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += centred[i] * centred[i + lag];
    result[lag] = sum / energy;
  }
  return result;
}

/** Sub-sample position of a local maximum at index i. */
function parabolaPeak(values: Float64Array, i: number): number {
  const prev = values[i - 1],
    curr = values[i],
    next = values[i + 1];
  const denominator = prev - 2 * curr + next;
  if (Math.abs(denominator) < 1e-12) return i;
  return i + Math.max(-0.5, Math.min(0.5, (prev - next) / (2 * denominator)));
}

/** Highest autocorrelation value and its sub-sample lag within a window around `lag`. */
function peakNear(acf: Float64Array, lag: number): { value: number; position: number } | null {
  const window = Math.max(1, Math.round(lag * HARMONIC_WINDOW));
  let best = -1;
  for (let i = Math.max(1, Math.round(lag) - window); i <= Math.round(lag) + window; i++)
    if (i < acf.length - 1 && (best < 0 || acf[i] > acf[best])) best = i;
  if (best < 1) return null;
  return { value: acf[best], position: parabolaPeak(acf, best) };
}

/**
 * The pitch fitted by least squares through the harmonic peaks (k * pitch for k = 1..), which
 * pins a fractional pitch far more precisely than the first peak alone. Also counts how many
 * harmonics beyond the first are elevated.
 */
function harmonicFit(acf: Float64Array, pitch: number): { pitch: number; harmonics: number } {
  let moment = pitch,
    weight = 1,
    harmonics = 0;
  for (let k = 2; k <= HARMONIC_ORDERS && k * pitch < acf.length - 1; k++) {
    const peak = peakNear(acf, (k * moment) / weight);
    if (!peak || peak.value <= HARMONIC_THRESHOLD) continue;
    harmonics++;
    moment += peak.position * k;
    weight += k * k;
  }
  return { pitch: moment / weight, harmonics };
}

function axisCandidates(acf: Float64Array, maxPitch: number): PitchCandidate[] {
  const found: PitchCandidate[] = [];
  const last = Math.min(acf.length - 2, Math.ceil(maxPitch));
  for (let i = MIN_PITCH; i <= last; i++) {
    if (!(acf[i] > acf[i - 1] && acf[i] >= acf[i + 1] && acf[i] > PEAK_THRESHOLD)) continue;
    const fit = harmonicFit(acf, parabolaPeak(acf, i));
    if (fit.harmonics < MIN_HARMONICS || fit.pitch < MIN_PITCH || fit.pitch > maxPitch) continue;
    found.push({
      pitch: fit.pitch,
      strength: acf[i] * (1 + fit.harmonics * HARMONIC_BONUS),
    });
  }
  return found;
}

/** Pixel-art cells are square: keep only pitches both axes find, weighted by their strength. */
function dualAxisVote(x: PitchCandidate[], y: PitchCandidate[]): PitchCandidate[] {
  const agreed: PitchCandidate[] = [];
  for (const a of x)
    for (const b of y) {
      const ratio = Math.max(a.pitch, b.pitch) / Math.min(a.pitch, b.pitch);
      if (ratio > 1 + DUAL_AXIS_TOLERANCE) continue;
      agreed.push({
        pitch: (a.pitch * a.strength + b.pitch * b.strength) / (a.strength + b.strength),
        strength: Math.min(a.strength, b.strength),
      });
    }
  return agreed.sort((a, b) => b.strength - a.strength);
}

/**
 * Candidate cell pitches, strongest first. Empty when neither axis shows a harmonic series or
 * the axes disagree. Each pitch leaves room for at least MIN_CELLS cells per axis and at most
 * MAX_RECOVERED_GRID_SIZE.
 */
export function searchGridPitches(image: PixelBuffer): PitchCandidate[] {
  const { width, height } = image;
  const minPitch = Math.max(MIN_PITCH, Math.max(width, height) / MAX_RECOVERED_GRID_SIZE);
  const maxPitch = Math.min(MAX_GRID_CELL_SIZE, Math.min(width, height) / MIN_CELLS);
  if (maxPitch < minPitch || width < 3 || height < 3) return [];
  const lag = (length: number) => Math.min(length - 2, Math.ceil(maxPitch * HARMONIC_ORDERS));
  const voted: PitchCandidate[] = [];
  for (const { order, span } of PROFILES) {
    // A span reaching across half a cell blurs the kinks of that cell size together.
    const fits = (candidate: PitchCandidate) => candidate.pitch >= span * SPAN_REACH;
    const x = axisCandidates(
      normalizedAutocorrelation(energyProfile(image, true, order, span), lag(width)),
      maxPitch,
    ).filter(fits);
    const y = axisCandidates(
      normalizedAutocorrelation(energyProfile(image, false, order, span), lag(height)),
      maxPitch,
    ).filter(fits);
    for (const candidate of dualAxisVote(x, y).slice(0, MAX_CANDIDATES)) {
      // Several spans finding one pitch is stronger evidence, not another proposal.
      const same = voted.find(
        (other) => Math.abs(other.pitch - candidate.pitch) <= SAME_PITCH * candidate.pitch,
      );
      if (!same) voted.push({ ...candidate });
      else {
        if (candidate.strength > same.strength) same.pitch = candidate.pitch;
        same.strength += candidate.strength;
      }
    }
  }
  voted.sort((a, b) => b.strength - a.strength);
  voted.length = Math.min(voted.length, MAX_BASE_PITCHES);
  const result: PitchCandidate[] = [];
  const push = (candidate: PitchCandidate) => {
    const cells = Math.round(width / candidate.pitch) * Math.round(height / candidate.pitch);
    if (candidate.pitch < minPitch || cells < MIN_GRID_CELLS) return;
    if (
      result.some(
        (other) => Math.abs(other.pitch - candidate.pitch) <= DUPLICATE_PITCH * candidate.pitch,
      )
    )
      return;
    result.push(candidate);
  };
  for (const candidate of voted) {
    // Sparse edges can make a multiple of the pitch the strongest peak; the arbiter judges the
    // sub-multiples too and keeps the coarsest that explains the image.
    for (let divisor = 1; divisor <= MAX_DIVISOR; divisor++) {
      const pitch = candidate.pitch / divisor;
      push({ pitch, strength: candidate.strength / divisor });
      const integer = Math.round(pitch);
      if (integer !== pitch && Math.abs(integer - pitch) <= INTEGER_SNAP)
        push({ pitch: integer, strength: candidate.strength / divisor });
    }
  }
  return result;
}
