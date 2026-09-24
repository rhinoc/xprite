import assert from "node:assert/strict";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/selection/operations.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const s = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
function morphology(mask, operation, radius, brush, width, height) {
  radius = Math.max(1, Math.min(100, Math.round(Number.isFinite(radius) ? radius : 1)));
  const size = radius * 2 + 1,
    kernel = new Uint8Array(size * size),
    offsets = [];
  if (brush === "square") kernel.fill(1);
  else
    s.selectionEllipseSpans(0, 0, size - 1, size - 1, (x, y, end) => {
      for (let u = x; u <= end; u++) kernel[y * size + u] = 1;
    });
  kernel[radius * size + radius] = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (kernel[y * size + x]) offsets.push({ x: x - radius, y: y - radius });
  const data = new Uint8Array(width * height);
  for (
    let y = Math.max(0, mask.y - radius);
    y < Math.min(height, mask.y + mask.height + radius);
    y++
  )
    for (
      let x = Math.max(0, mask.x - radius);
      x < Math.min(width, mask.x + mask.width + radius);
      x++
    ) {
      const c = s.selectionContains(mask, x, y);
      const selected =
        operation === "expand"
          ? c || offsets.some((p) => s.selectionContains(mask, x + p.x, y + p.y))
          : c &&
            (operation === "contract"
              ? offsets.every((p) => s.selectionContains(mask, x + p.x, y + p.y))
              : offsets.some((p) => !s.selectionContains(mask, x + p.x, y + p.y)));
      if (selected) data[y * width + x] = 1;
    }
  return s.compactSelection({ x: 0, y: 0, width, height, data });
}
let seed = 987;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
for (let trial = 0; trial < 140; trial++) {
  const width = 5 + (random() % 23),
    height = 5 + (random() % 19),
    mw = 1 + (random() % 25),
    mh = 1 + (random() % 21);
  const mask = {
    x: (random() % 17) - 8,
    y: (random() % 15) - 7,
    width: mw,
    height: mh,
    data: Uint8Array.from({ length: mw * mh }, () => (random() % 5 ? 255 : 0)),
  };
  const radius = trial < 135 ? random() % 10 : [50, 100, NaN, 0, -5][trial - 135];
  for (const brush of ["circle", "square"])
    for (const operation of ["expand", "contract", "border"])
      assert.deepEqual(
        s.modifySelection(mask, operation, radius, brush, width, height),
        morphology(mask, operation, radius, brush, width, height),
        `${trial}/${brush}/${operation}`,
      );
}
for (let trial = 0; trial < 100; trial++) {
  const width = 1 + (random() % 31),
    height = 1 + (random() % 27),
    data = Uint8ClampedArray.from({ length: width * height * 4 }, () => (random() % 5) * 50),
    image = { width, height, data },
    x = random() % width,
    y = random() % height,
    tolerance = trial % 3 === 0 ? 60 : 0;
  const target = Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)),
    mask = new Uint8Array(width * height),
    seen = new Uint8Array(width * height),
    queue = [y * width + x];
  while (queue.length) {
    const p = queue.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (
      !(data[i + 3] === 0 && target[3] === 0) &&
      !target.every((v, c) => Math.abs(v - data[i + c]) <= tolerance)
    )
      continue;
    mask[p] = 1;
    const px = p % width,
      py = Math.floor(p / width);
    if (px) queue.push(p - 1);
    if (px + 1 < width) queue.push(p + 1);
    if (py) queue.push(p - width);
    if (py + 1 < height) queue.push(p + width);
  }
  assert.deepEqual(
    s.magicWandSelection(image, { x, y }, tolerance),
    s.compactSelection({ x: 0, y: 0, width, height, data: mask }),
  );
  const a = { x: (random() % 60) - 20, y: (random() % 50) - 20 },
    b = { x: (random() % 60) - 20, y: (random() % 50) - 20 },
    full = new Uint8Array(width * height);
  s.selectionEllipseSpans(a.x, a.y, b.x, b.y, (sx, sy, end) => {
    if (sy < 0 || sy >= height) return;
    for (let u = Math.max(0, sx); u <= Math.min(width - 1, end); u++) full[sy * width + u] = 1;
  });
  assert.deepEqual(
    s.ellipseSelection(a, b, width, height),
    s.compactSelection({ x: 0, y: 0, width, height, data: full }),
  );
}
console.log(
  "Selection fast paths: 840 morphology cases (off-canvas, nonbinary, radii through 100), 100 BFS wand cases, and 100 clipped ellipses match generic references.",
);
for (let trial = 0; trial < 100; trial++) {
  const width = 1 + (random() % 31),
    height = 1 + (random() % 33),
    mask = {
      x: (random() % 20) - 10,
      y: (random() % 20) - 10,
      width,
      height,
      data: Uint8Array.from({ length: width * height }, () => (random() % 3 === 0 ? 127 : 0)),
    };
  const before = mask.data.slice();
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask.data[y * width + x]) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  let expected = null;
  if (right >= 0) {
    const w = right - left + 1,
      h = bottom - top + 1,
      data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) data[y * w + x] = mask.data[(top + y) * width + left + x] ? 1 : 0;
    expected = { x: mask.x + left, y: mask.y + top, width: w, height: h, data };
  }
  assert.deepEqual(s.compactSelection(mask), expected);
  assert.deepEqual(mask.data, before);
}
console.log(
  "Mask compaction preserves offsets, normalized bits and source ownership against a full-pixel reference.",
);
