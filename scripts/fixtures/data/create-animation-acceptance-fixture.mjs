import fs from "node:fs";

import { build } from "esbuild";
const b = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString("base64")}`
);
const width = 16,
  height = 16,
  palette = [
    [0, 0, 0, 0],
    [230, 70, 50, 255],
    [70, 160, 240, 255],
    [255, 255, 255, 255],
  ];
const frames = Array.from({ length: 3 }, (_, frame) => {
  const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (let y = 4; y < 12; y++)
    for (let x = 2 + frame * 3; x < 7 + frame * 3; x++)
      image.data.set(palette[(frame % 2) + 1], (y * width + x) * 4);
  return {
    duration: 100 + frame * 50,
    cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }],
  };
});
const timeline = {
  activeFrame: 1,
  activeLayer: 0,
  layers: [
    {
      id: "layer",
      name: "Layer",
      kind: "image",
      parentId: null,
      blendMode: 0,
      opacity: 255,
      visible: true,
      locked: false,
      flags: 3,
    },
  ],
  frames,
};
fs.mkdirSync(".tmp/features-7-12", { recursive: true });
fs.writeFileSync(
  ".tmp/features-7-12/animation-fixture.aseprite",
  m.encodeAsepriteSync(
    m.asepriteFromProject({ image: frames[1].cels[0].pixels, timeline, palette }),
  ),
);
