import assert from "node:assert/strict";

import { build } from "esbuild";
const { outputFiles } = await build({
  stdin: {
    contents: `export {renderTimelineFrame} from './packages/editor-core/src/timeline/timeline.ts'; export {blendNormalAt,blendAt,mulUn8} from './packages/editor-core/src/canvas/blend-modes.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { renderTimelineFrame, blendNormalAt, blendAt, mulUn8 } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
function normal(d, at, s, from, opacity) {
  const ba = d[at + 3],
    sa = mulUn8(s[from + 3], opacity);
  if (!ba) {
    d.set(s.subarray(from, from + 3), at);
    d[at + 3] = sa;
    return;
  }
  if (!s[from + 3]) return;
  const a = sa + ba - mulUn8(ba, sa);
  for (let c = 0; c < 3; c++) d[at + c] += Math.trunc(((s[from + c] - d[at + c]) * sa) / a);
  d[at + 3] = a;
}
for (let ba = 0; ba < 256; ba++)
  for (let sa = 0; sa < 256; sa++)
    for (const opacity of [0, 1, 127, 254, 255]) {
      const a = new Uint8ClampedArray([217, 4, 151, ba]),
        b = a.slice(),
        s = new Uint8ClampedArray([5, 201, 91, sa]);
      normal(a, 0, s, 0, opacity);
      blendNormalAt(b, 0, s, 0, opacity);
      assert.deepEqual(b, a);
    }
let seed = 91;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
// Independent generic sampler covers clipping, hidden RGB, opacity, blend modes,
// multiple layers, fractional reference bounds and unaligned source buffers.
for (let trial = 0; trial < 250; trial++) {
  const width = 17,
    height = 13,
    layers = [],
    cels = [];
  for (let l = 0; l < 1 + (trial % 4); l++) {
    const w = 3 + (random() % 20),
      h = 3 + (random() % 15),
      data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4 + 1), 1, w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = random() % 256;
    for (let i = 3; i < data.length; i += 8) data[i] = trial % 2 ? 255 : 0;
    layers.push({
      id: String(l),
      name: String(l),
      visible: true,
      locked: false,
      opacity: trial % 3 ? 255 : 127,
      flags: trial % 4 === 0 ? 64 : 1,
      blendMode: trial % 19,
    });
    cels.push({
      pixels: { width: w, height: h, data },
      x: (random() % 12) - 5,
      y: (random() % 9) - 4,
      opacity: trial % 5 ? 255 : 99,
      zIndex: 0,
      ...(trial % 4 === 0 ? { preciseBounds: { x: -1.25, y: 2.3, width: 12.7, height: 9.2 } } : {}),
    });
  }
  const expected = new Uint8ClampedArray(width * height * 4);
  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l],
      cel = cels[l],
      image = cel.pixels,
      b =
        layer.flags & 64
          ? cel.preciseBounds
          : { x: cel.x, y: cel.y, width: image.width, height: image.height };
    for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(height, Math.ceil(b.y + b.height)); y++)
      for (
        let x = Math.max(0, Math.floor(b.x));
        x < Math.min(width, Math.ceil(b.x + b.width));
        x++
      ) {
        const sx = Math.max(
            0,
            Math.min(image.width - 1, Math.floor(((x - b.x) * image.width) / b.width)),
          ),
          sy = Math.max(
            0,
            Math.min(image.height - 1, Math.floor(((y - b.y) * image.height) / b.height)),
          );
        blendAt(
          expected,
          (y * width + x) * 4,
          image.data,
          (sy * image.width + sx) * 4,
          mulUn8(layer.opacity, cel.opacity),
          layer.blendMode,
        );
      }
  }
  const actual = renderTimelineFrame(
    { layers, frames: [{ duration: 100, cels }], activeLayer: 0, activeFrame: 0 },
    width,
    height,
    0,
  );
  assert.deepEqual(actual.data, expected, `generic compositor equivalence trial ${trial}`);
}
console.log(
  "Compositor: 327680 alpha/opacity combinations and 250 mixed-layer sampling cases match the original arithmetic byte for byte.",
);
