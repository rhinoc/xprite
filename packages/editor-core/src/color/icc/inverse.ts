import { unit } from "$/color/icc/curves";
import type { IccTransform, IccVector } from "$/color/icc/pcs";

const SEED_GRID = 5;
const ITERATIONS = 20;
const DIFFERENCE_STEP = 1 / 1024;
const REGULARIZATION = 1e-8;
const TARGET_ERROR = 1e-14;
const LINE_SEARCH_STEPS = 8;

const distance = (a: IccVector, b: IccVector) =>
  a.reduce((sum, channel, index) => sum + (channel - b[index]) ** 2, 0);

function solve(matrix: readonly number[], value: IccVector): IccVector | undefined {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-24) return undefined;
  return [
    ((e * i - f * h) * value[0] + (c * h - b * i) * value[1] + (b * f - c * e) * value[2]) /
      determinant,
    ((f * g - d * i) * value[0] + (a * i - c * g) * value[1] + (c * d - a * f) * value[2]) /
      determinant,
    ((d * h - e * g) * value[0] + (b * g - a * h) * value[1] + (a * e - b * d) * value[2]) /
      determinant,
  ];
}

/** Input profiles may omit B2A. Use their forward transform to find the nearest
 * in-gamut RGB instead of pretending their LUT is a matrix or editing in sRGB. */
export function inverseIccLut(forward: IccTransform): IccTransform {
  let seeds: { rgb: IccVector; pcs: IccVector }[] | undefined;
  return (target) => {
    if (!seeds) {
      seeds = [];
      for (let r = 0; r < SEED_GRID; r++)
        for (let g = 0; g < SEED_GRID; g++)
          for (let b = 0; b < SEED_GRID; b++) {
            const rgb: IccVector = [r / (SEED_GRID - 1), g / (SEED_GRID - 1), b / (SEED_GRID - 1)];
            seeds.push({ rgb, pcs: forward(rgb) });
          }
    }
    let current = seeds[0].rgb,
      best = distance(seeds[0].pcs, target);
    for (const seed of seeds) {
      const error = distance(seed.pcs, target);
      if (error < best) {
        current = seed.rgb;
        best = error;
      }
    }
    for (let iteration = 0; iteration < ITERATIONS && best > TARGET_ERROR; iteration++) {
      const pcs = forward(current);
      const columns = current.map((_, axis) => {
        const low = [...current],
          high = [...current];
        low[axis] = unit(low[axis] - DIFFERENCE_STEP);
        high[axis] = unit(high[axis] + DIFFERENCE_STEP);
        const lower = forward(low as unknown as IccVector),
          upper = forward(high as unknown as IccVector);
        return upper.map((channel, row) => (channel - lower[row]) / (high[axis] - low[axis]));
      });
      const matrix = columns.flatMap((column, row) =>
        columns.map((other, index) =>
          column.reduce(
            (sum, value, axis) => sum + value * other[axis],
            row === index ? REGULARIZATION : 0,
          ),
        ),
      );
      const residual = columns.map((column) =>
        column.reduce((sum, value, axis) => sum + value * (target[axis] - pcs[axis]), 0),
      ) as unknown as IccVector;
      const delta = solve(matrix, residual);
      if (!delta) break;
      let improved = false;
      for (let step = 0; step < LINE_SEARCH_STEPS; step++) {
        const next = current.map((channel, axis) =>
          unit(channel + delta[axis] / 2 ** step),
        ) as unknown as IccVector;
        const error = distance(forward(next), target);
        if (error < best) {
          current = next;
          best = error;
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
    return current;
  };
}
