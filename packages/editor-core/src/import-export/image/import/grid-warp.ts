/**
 * A smoothly warped lattice along one axis: u(x) is the (continuous) cell index at raster position
 * x, so cuts sit where u crosses an integer. A uniform grid is the linear case; an upscale whose cell
 * size drifts across the image bends u gently.
 *
 * Every measured edge is a cut, but most cuts show no edge (neighbouring cells of one colour), so
 * the hard part is how many cells each gap between edges spans. A single global pitch gains or loses
 * a cell over long flat runs once the cell size drifts. Instead the gaps are labelled jointly
 * (Viterbi): the state is the local pitch on a log scale, a gap of g pixels spans round(g / pitch)
 * cells, its quantisation misfit is the observation cost, and the pitch may wander from gap to gap
 * like a random walk whose variance grows with the cells between the two gaps' centres. u is then fitted by least
 * squares to the labelled edges, piecewise linear on evenly spaced knots under a second-difference
 * penalty, so the pitch may drift but not jump and flat stretches continue the neighbouring pitch.
 */
export interface AxisWarp {
  readonly spacing: number;
  /** u at x = m * spacing. */
  readonly values: Float64Array;
}

export interface WarpEdge {
  readonly position: number;
  readonly weight: number;
}

/** Knot spacing in cells. */
const KNOT_CELLS = 2;
/** Smoothness weight per knot, relative to the mean edge weight per knot. */
const SMOOTHNESS = 4;
const RIDGE = 1e-9;
/** Gaps of at least this many cells (one hidden cut or more) may gain or lose a cell. */
const MIN_RELABEL_CELLS = 2;
const RELABEL_PASSES = 3;
/** Relative drop of the penalised error that a changed gap must earn. */
const RELABEL_GAIN = 0.03;
/** Range of local pitches the labelling considers, around the proposed pitch. */
const PITCH_LOW = 0.7;
const PITCH_HIGH = 1.6;
/** Relative step between pitch states. */
const PITCH_RESOLUTION = 0.006;
/** Standard deviation of one gap's length in pixels between soft (sub-pixel) edges. */
const GAP_NOISE = 0.45;
/**
 * Least likelihood of a crisp gap's misfit. Crisp edges are cuts rounded to the raster, so a gap
 * misses its cells by less than a pixel (a triangular density on (-1, 1)); the floor bounds the
 * cost of a stray edge.
 */
const ROUNDING_FLOOR = 1e-3;
/**
 * Standard deviation of the log pitch's wander across the whole axis. Distortions bend the grid
 * over the image, not per cell, so the allowance per cell shrinks as the cells grow in number.
 */
const DRIFT = 0.2;
/**
 * Bounds of the share of cuts that show no edge (neighbouring cells of one colour). A gap of
 * several cells hides a cut, at -log of that share: detailed art, where most cuts show, keeps the
 * coarser of two labellings that fit equally well. Hidden cuts come in flat runs, so each further
 * cell of the gap costs only CELL_COST and long gaps follow the neighbouring pitch.
 */
const MIN_HIDDEN = 0.02;
const MAX_HIDDEN = 0.9;
const CELL_COST = 0.02;

export function warpAt(warp: AxisWarp, x: number): number {
  const { spacing, values } = warp;
  const last = values.length - 1;
  const t = x / spacing;
  const m = Math.max(0, Math.min(last - 1, Math.floor(t)));
  const a = t - m;
  return values[m] * (1 - a) + values[m + 1] * a;
}

/** Local pitch (pixels per cell) at x. */
export function warpPitch(warp: AxisWarp, x: number): number {
  const { spacing, values } = warp;
  const m = Math.max(0, Math.min(values.length - 2, Math.floor(x / spacing)));
  const slope = (values[m + 1] - values[m]) / spacing;
  return slope > 0 ? 1 / slope : Infinity;
}

/** Position in [from, to] where u reaches `index` (u is increasing there); NaN when it does not. */
export function warpInverse(warp: AxisWarp, index: number, from: number, to: number): number {
  let lo = from,
    hi = to;
  if (warpAt(warp, lo) > index || warpAt(warp, hi) < index) return NaN;
  for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (warpAt(warp, mid) < index) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Solves the symmetric positive definite pentadiagonal system (band Cholesky). */
export function solveBanded(
  diag: Float64Array,
  off1: Float64Array,
  off2: Float64Array,
  rhs: Float64Array,
): Float64Array {
  const n = diag.length;
  // l0 = L[i][i], l1 = L[i][i-1], l2 = L[i][i-2]
  const l0 = new Float64Array(n),
    l1 = new Float64Array(n),
    l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a2 = i >= 2 ? off2[i - 2] / l0[i - 2] : 0;
    const a1 = i >= 1 ? (off1[i - 1] - (i >= 2 ? a2 * l1[i - 1] : 0)) / l0[i - 1] : 0;
    l0[i] = Math.sqrt(Math.max(diag[i] - a1 * a1 - a2 * a2, RIDGE));
    l1[i] = a1;
    l2[i] = a2;
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++)
    y[i] = (rhs[i] - (i >= 1 ? l1[i] * y[i - 1] : 0) - (i >= 2 ? l2[i] * y[i - 2] : 0)) / l0[i];
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--)
    x[i] =
      (y[i] - (i + 1 < n ? l1[i + 1] * x[i + 1] : 0) - (i + 2 < n ? l2[i + 2] * x[i + 2] : 0)) /
      l0[i];
  return x;
}

/**
 * Least-squares knot values for edges at integer `targets`, under the smoothness penalty, and the
 * penalised squared error they leave.
 */
function solve(
  length: number,
  spacing: number,
  edges: readonly WarpEdge[],
  targets: Float64Array,
): { warp: AxisWarp; cost: number } {
  const n = Math.max(2, Math.ceil(length / spacing) + 1);
  const diag = new Float64Array(n),
    off1 = new Float64Array(n),
    off2 = new Float64Array(n),
    rhs = new Float64Array(n);
  let total = 0;
  for (let j = 0; j < edges.length; j++) {
    const { position, weight: w } = edges[j];
    const t = position / spacing;
    const m = Math.max(0, Math.min(n - 2, Math.floor(t)));
    const a = t - m;
    diag[m] += w * (1 - a) * (1 - a);
    diag[m + 1] += w * a * a;
    off1[m] += w * a * (1 - a);
    rhs[m] += w * (1 - a) * targets[j];
    rhs[m + 1] += w * a * targets[j];
    total += w;
  }
  const lambda = (SMOOTHNESS * total) / n;
  const c = [1, -2, 1];
  for (let m = 1; m + 1 < n; m++)
    for (let p = 0; p < 3; p++)
      for (let q = p; q < 3; q++) {
        const v = lambda * c[p] * c[q];
        const row = m - 1 + p;
        if (q === p) diag[row] += v;
        else if (q - p === 1) off1[row] += v;
        else off2[row] += v;
      }
  for (let m = 0; m < n; m++) diag[m] += RIDGE * (lambda + 1);
  const warp = { spacing, values: solveBanded(diag, off1, off2, rhs) };
  let cost = 0;
  for (let j = 0; j < edges.length; j++) {
    const residual = warpAt(warp, edges[j].position) - targets[j];
    cost += edges[j].weight * residual * residual;
  }
  const v = warp.values;
  for (let m = 1; m + 1 < n; m++) {
    const bend = v[m - 1] - 2 * v[m] + v[m + 1];
    cost += lambda * bend * bend;
  }
  return { warp, cost };
}
/**
 * The labelling's random walk lets the pitch wander over a long run without edges, where one cell
 * more or less fits equally well. The warp's smoothness then decides: each gap of several cells
 * tries one cell more and one less (shifting every later edge), kept when the penalised error drops.
 */
function relabel(
  length: number,
  spacing: number,
  edges: readonly WarpEdge[],
  labels: Float64Array,
): AxisWarp {
  let best = solve(length, spacing, edges, labels);
  for (let pass = 0; pass < RELABEL_PASSES; pass++) {
    let changed = false;
    for (let j = 0; j + 1 < labels.length; j++) {
      const cells = labels[j + 1] - labels[j];
      if (cells < MIN_RELABEL_CELLS) continue;
      for (const step of [-1, 1]) {
        if (cells + step < MIN_RELABEL_CELLS) continue;
        const trial = labels.slice();
        for (let k = j + 1; k < trial.length; k++) trial[k] += step;
        const fit = solve(length, spacing, edges, trial);
        if (fit.cost < best.cost * (1 - RELABEL_GAIN)) {
          best = fit;
          labels = trial;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return best.warp;
}

/** Cell index of every edge (the first is 0), by the jointly best labelling of the gaps. */
function labelEdges(
  positions: readonly number[],
  proposed: number,
  minPitch: number,
  crisp: boolean,
): Float64Array {
  const ratio = 1 + PITCH_RESOLUTION;
  const pitches: number[] = [];
  for (let p = Math.max(minPitch, proposed * PITCH_LOW); p <= proposed * PITCH_HIGH; p *= ratio)
    pitches.push(p);
  const states = pitches.length;
  const logs = pitches.map(Math.log);
  const gaps = positions.length - 1;
  const from = new Int16Array(gaps * states);
  const cellsOf = new Int32Array(gaps * states);
  let cost = new Float64Array(states);
  let next = new Float64Array(states);
  const obsScale = 1 / (2 * GAP_NOISE * GAP_NOISE);
  const span = positions[gaps] - positions[0];
  const hidden = Math.min(
    MAX_HIDDEN,
    Math.max(MIN_HIDDEN, 1 - gaps / Math.max(1, span / proposed)),
  );
  const shownCost = -Math.log(1 - hidden),
    hiddenCost = -Math.log(hidden);
  const driftScale = Math.max(1, span / proposed) / (2 * DRIFT * DRIFT);
  for (let j = 0; j < gaps; j++) {
    const gap = positions[j + 1] - positions[j];
    for (let b = 0; b < states; b++) {
      const cells = Math.max(1, Math.round(gap / pitches[b]));
      const misfit = gap - cells * pitches[b];
      let best = Infinity,
        arg = 0;
      for (let a = 0; a < states; a++) {
        const d = logs[b] - logs[a];
        const between = j > 0 ? (cellsOf[(j - 1) * states + a] + cells) / 2 : cells;
        const value = cost[a] + (d * d * driftScale) / between;
        if (value < best) {
          best = value;
          arg = a;
        }
      }
      const observation = crisp
        ? -Math.log(Math.max(ROUNDING_FLOOR, 1 - Math.abs(misfit)))
        : misfit * misfit * obsScale;
      const hiding = cells > 1 ? hiddenCost + CELL_COST * (cells - 2) : 0;
      next[b] = best + observation + shownCost + hiding;
      from[j * states + b] = arg;
      cellsOf[j * states + b] = cells;
    }
    [cost, next] = [next, cost];
  }
  let state = 0;
  for (let b = 1; b < states; b++) if (cost[b] < cost[state]) state = b;
  const labels = new Float64Array(positions.length);
  const steps = new Int32Array(gaps);
  for (let j = gaps - 1; j >= 0; j--) {
    steps[j] = cellsOf[j * states + state];
    state = from[j * states + state];
  }
  for (let j = 0; j < gaps; j++) labels[j + 1] = labels[j] + steps[j];
  return labels;
}

/**
 * Fits u over [0, length] to `edges` with local pitches near `proposed`, none below `minPitch`
 * (where the edges of narrower cells would merge); null with too few edges. `crisp` edges sit on
 * whole pixels of a nearest-neighbour upscale.
 * u(0) is shifted to the integer nearest zero, so a grid that starts on the image border starts at
 * index 0.
 */
export function fitWarp(
  edges: readonly WarpEdge[],
  length: number,
  proposed: number,
  minPitch: number,
  crisp: boolean,
): AxisWarp | null {
  if (edges.length < 3 || !(proposed > 0)) return null;
  const weights = edges.map((edge) => edge.weight).sort((a, b) => a - b);
  const median = weights[Math.floor(weights.length / 2)] || 1;
  const normalised = edges.map((edge) => ({
    position: edge.position,
    weight: Math.min(2, Math.max(0.25, Math.sqrt(edge.weight / median))),
  }));
  const labels = labelEdges(
    normalised.map((edge) => edge.position),
    proposed,
    minPitch,
    crisp,
  );
  const span = normalised[normalised.length - 1].position - normalised[0].position;
  const mean = labels[labels.length - 1] > 0 ? span / labels[labels.length - 1] : proposed;
  let warp = relabel(length, Math.max(1, KNOT_CELLS * mean), normalised, labels);
  const shift = Math.round(warpAt(warp, 0));
  if (shift) warp = { spacing: warp.spacing, values: warp.values.map((v) => v - shift) };
  return warp;
}
