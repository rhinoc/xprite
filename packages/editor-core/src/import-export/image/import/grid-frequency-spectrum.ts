const TAU = 2 * Math.PI;

interface Spectrum {
  real: Float64Array;
  imaginary: Float64Array;
}

/** In-place radix-2 transform; inverse includes the convolution's normalization. */
function radix2(real: Float64Array, imaginary: Float64Array, inverse = false): void {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index++) {
    let bit = length / 2;
    while (reversed & bit) {
      reversed ^= bit;
      bit /= 2;
    }
    reversed ^= bit;
    if (index < reversed) {
      const r = real[index],
        i = imaginary[index];
      real[index] = real[reversed];
      imaginary[index] = imaginary[reversed];
      real[reversed] = r;
      imaginary[reversed] = i;
    }
  }
  const direction = inverse ? 1 : -1;
  for (let size = 2; size <= length; size *= 2) {
    const half = size / 2;
    for (let offset = 0; offset < half; offset++) {
      const angle = (direction * TAU * offset) / size;
      const cosine = Math.cos(angle),
        sine = Math.sin(angle);
      for (let index = offset; index < length; index += size) {
        const other = index + half;
        const r = real[other] * cosine - imaginary[other] * sine;
        const i = real[other] * sine + imaginary[other] * cosine;
        real[other] = real[index] - r;
        imaginary[other] = imaginary[index] - i;
        real[index] += r;
        imaginary[index] += i;
      }
    }
  }
  if (inverse)
    for (let index = 0; index < length; index++) {
      real[index] /= length;
      imaginary[index] /= length;
    }
}

/**
 * Unnormalized DFT, F[k] = sum input[j] exp(-2 pi i j k / length), at the original
 * integer frequencies. Bluestein pads only its convolution, so prime and odd image sizes keep
 * the same frequency-to-cell-count relationship as a direct projection.
 */
export function gridFrequencySpectrum(input: Float64Array): Spectrum {
  const length = input.length;
  if (length === 0) return { real: new Float64Array(), imaginary: new Float64Array() };
  if ((length & (length - 1)) === 0) {
    const real = input.slice(),
      imaginary = new Float64Array(length);
    radix2(real, imaginary);
    return { real, imaginary };
  }

  let padded = 1;
  while (padded < 2 * length - 1) padded *= 2;
  const real = new Float64Array(padded),
    imaginary = new Float64Array(padded),
    kernelReal = new Float64Array(padded),
    kernelImaginary = new Float64Array(padded),
    cosine = new Float64Array(length),
    sine = new Float64Array(length);
  for (let index = 0; index < length; index++) {
    // The chirp is periodic in index² modulo 2 * length. Reduce before evaluating trig.
    const angle = (Math.PI * ((index * index) % (2 * length))) / length;
    cosine[index] = Math.cos(angle);
    sine[index] = Math.sin(angle);
    real[index] = input[index] * cosine[index];
    imaginary[index] = -input[index] * sine[index];
    kernelReal[index] = cosine[index];
    kernelImaginary[index] = sine[index];
    if (index) {
      kernelReal[padded - index] = cosine[index];
      kernelImaginary[padded - index] = sine[index];
    }
  }
  radix2(real, imaginary);
  radix2(kernelReal, kernelImaginary);
  for (let index = 0; index < padded; index++) {
    const r = real[index] * kernelReal[index] - imaginary[index] * kernelImaginary[index];
    imaginary[index] = real[index] * kernelImaginary[index] + imaginary[index] * kernelReal[index];
    real[index] = r;
  }
  radix2(real, imaginary, true);
  const resultReal = new Float64Array(length),
    resultImaginary = new Float64Array(length);
  for (let index = 0; index < length; index++) {
    resultReal[index] = real[index] * cosine[index] + imaginary[index] * sine[index];
    resultImaginary[index] = imaginary[index] * cosine[index] - real[index] * sine[index];
  }
  return { real: resultReal, imaginary: resultImaginary };
}
