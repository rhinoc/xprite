import { describe, expect, test } from "vitest";

import {
  combSignificance,
  FrameModel,
} from "$/import-export/image/import/grid/detect/frame-lattice";

/** The pre-FFT projection, including its recurrence and end-point treatment. */
function directComb(
  profile: Float64Array,
  first: number,
  last: number,
  model: FrameModel,
): Float64Array {
  const length = profile.length;
  const soft = model === FrameModel.Soft;
  const end = soft ? length - 1 : length;
  const centred = new Float64Array(length);
  let mean = 0;
  for (let index = 1; index < end; index++) mean += profile[index];
  mean /= end - 1;
  let energy = 0;
  for (let index = 1; index < end; index++) {
    centred[index] = profile[index] - mean;
    energy += centred[index] ** 2;
  }
  const noise = Math.sqrt(energy / 2);
  const significance = new Float64Array(last - first + 1);
  if (noise <= 0) return significance;
  for (let count = first; count <= last; count++) {
    const step = (2 * Math.PI * count) / length;
    const stepCos = Math.cos(step),
      stepSin = Math.sin(step);
    let cosine = soft ? Math.cos(step / 2) : 1,
      sine = soft ? Math.sin(step / 2) : 0,
      sum = 0;
    for (let index = 0; index < length; index++) {
      sum += centred[index] * cosine;
      const next = cosine * stepCos - sine * stepSin;
      sine = sine * stepCos + cosine * stepSin;
      cosine = next;
    }
    significance[count - first] = ((soft ? -1 : 1) * sum) / noise;
  }
  return significance;
}

function largest(values: Float64Array): number {
  let best = 0;
  for (let index = 1; index < values.length; index++)
    if (values[index] > values[best]) best = index;
  return best;
}

describe.each([FrameModel.Soft, FrameModel.Hard])("%s frame comb", (model) => {
  test.each([32, 127, 256, 511, 1024])(
    "retains every signed projection and strongest unaliased count at length %i",
    (length) => {
      const count = 13;
      const soft = model === FrameModel.Soft;
      const profile = Float64Array.from({ length }, (_, index) => {
        const phase = (2 * Math.PI * count * (index + (soft ? 0.5 : 0))) / length;
        return 4 + (soft ? -1 : 1) * Math.cos(phase) + 0.2 * Math.sin(index * 1.731);
      });
      // Boundary entries carry no measurements and must stay excluded even when nonzero.
      profile[0] = 1e6;
      if (soft) profile[length - 1] = 1e6;
      const first = 1,
        last = length - 1;
      const expected = directComb(profile, first, last, model);
      const actual = combSignificance(profile, first, last, model);
      expect(actual.first).toBe(first);
      expect(actual.significance.length).toBe(expected.length);
      for (let index = 0; index < expected.length; index++)
        expect(actual.significance[index]).toBeCloseTo(expected[index], 9);
      // Hard combs at k and length - k are exact aliases; compare the unique half here.
      const unaliased = Math.floor(length / 2);
      expect(largest(actual.significance.subarray(0, unaliased))).toBe(
        largest(expected.subarray(0, unaliased)),
      );
      // A magnitude spectrum would discard the negative projections and fail this check.
      expect(Math.min(...actual.significance)).toBeLessThan(-0.1);
    },
  );

  test.each([5 - 1e-7, 5 + 1e-7])(
    "keeps the significance decision near the threshold (%f)",
    (target) => {
      const length = 257,
        count = 17;
      const soft = model === FrameModel.Soft;
      const profileAt = (amplitude: number) =>
        Float64Array.from({ length }, (_, index) => {
          const phase = (2 * Math.PI * count * (index + (soft ? 0.5 : 0))) / length;
          return 8 + Math.sin(index * 1.731) + (soft ? -1 : 1) * amplitude * Math.cos(phase);
        });
      let low = 0,
        high = 4;
      for (let iteration = 0; iteration < 60; iteration++) {
        const middle = (low + high) / 2;
        const value = directComb(profileAt(middle), count, count, model)[0];
        if (value < target) low = middle;
        else high = middle;
      }
      const profile = profileAt((low + high) / 2);
      const expected = directComb(profile, count, count, model)[0];
      const actual = combSignificance(profile, count, count, model).significance[0];
      expect(expected).toBeCloseTo(target, 10);
      expect(actual).toBeCloseTo(expected, 9);
      expect(actual >= 5).toBe(expected >= 5);
    },
  );

  test("a constant profile has no significant count", () => {
    const profile = new Float64Array(127).fill(4);
    expect(combSignificance(profile, 8, 64, model).significance).toEqual(new Float64Array(57));
  });
});
