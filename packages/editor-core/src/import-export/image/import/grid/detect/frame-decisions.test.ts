import { describe, expect, test, vi } from "vitest";

import { detectFrameLattices } from "$/import-export/image/import/grid/detect/frame-lattice";
import {
  addNoise,
  boxBlur,
  detailedSprite,
  fractionalUpscale,
  softBilinear,
} from "$/import-export/image/import/grid/test-images";

const mode = vi.hoisted(() => ({ direct: false }));

vi.mock("$/import-export/image/import/grid/detect/frequency-spectrum", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("$/import-export/image/import/grid/detect/frequency-spectrum")
    >();
  return {
    gridFrequencySpectrum: (input: Float64Array) => {
      if (!mode.direct) return original.gridFrequencySpectrum(input);
      const length = input.length;
      const real = new Float64Array(length),
        imaginary = new Float64Array(length);
      for (let count = 0; count < length; count++)
        for (let index = 0; index < length; index++) {
          const angle = (2 * Math.PI * count * index) / length;
          real[count] += input[index] * Math.cos(angle);
          imaginary[count] -= input[index] * Math.sin(angle);
        }
      return { real, imaginary };
    },
  };
});

describe("frame decisions with FFT", () => {
  const art = detailedSprite(40, 30, 3);
  const cases = [
    ["hard integer upscale", fractionalUpscale(art, 4)],
    ["hard odd rectangular frame", fractionalUpscale(art, 2.525)],
    ["soft upscale", softBilinear(art, 2.62)],
    ["soft fine alias", softBilinear(art, 1.94)],
    ["noisy hard upscale", addNoise(fractionalUpscale(art, 2.525), 40)],
    ["blurred hard upscale", boxBlur(fractionalUpscale(art, 2.525), 1)],
  ] as const;

  test.each(cases)(
    "matches direct DFT through alias and reconstruction gates: %s",
    (_name, image) => {
      let expected: ReturnType<typeof detectFrameLattices>;
      mode.direct = true;
      try {
        expected = detectFrameLattices(image);
      } finally {
        mode.direct = false;
      }
      expect(detectFrameLattices(image)).toEqual(expected);
    },
  );
});
