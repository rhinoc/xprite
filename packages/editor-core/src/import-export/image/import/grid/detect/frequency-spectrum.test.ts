import { describe, expect, test } from "vitest";

import { gridFrequencySpectrum } from "$/import-export/image/import/grid/detect/frequency-spectrum";

describe("grid frequency spectrum", () => {
  test.each([1, 3, 15, 32, 127, 256, 511, 1024])(
    "keeps the complex DFT at the original %i frequencies",
    (length) => {
      const input = Float64Array.from(
        { length },
        (_, index) => Math.sin(index * 1.731) + 0.4 * Math.cos(index * 0.371) + index / length,
      );
      const saved = input.slice();
      const spectrum = gridFrequencySpectrum(input);
      expect(spectrum.real.length).toBe(length);
      expect(spectrum.imaginary.length).toBe(length);
      for (let count = 0; count < length; count++) {
        let real = 0,
          imaginary = 0;
        for (let index = 0; index < length; index++) {
          const angle = (2 * Math.PI * count * index) / length;
          real += input[index] * Math.cos(angle);
          imaginary -= input[index] * Math.sin(angle);
        }
        expect(spectrum.real[count]).toBeCloseTo(real, 8);
        expect(spectrum.imaginary[count]).toBeCloseTo(imaginary, 8);
      }
      expect(input).toEqual(saved);
    },
  );

  test("accepts an empty profile", () => {
    const spectrum = gridFrequencySpectrum(new Float64Array());
    expect(spectrum.real.length).toBe(0);
    expect(spectrum.imaginary.length).toBe(0);
  });
});
