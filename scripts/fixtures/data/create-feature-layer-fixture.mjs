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
const image = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
for (let y = 0; y < 16; y++)
  for (let x = 0; x < 16; x++)
    image.data.set((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * 16 + x) * 4);
const top = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
for (let i = 0; i < 16; i++) top.data.set([255, 0, 0, 128], i * 4);
const layer = (id, name, more = {}) => ({
  id,
  name,
  kind: "image",
  parentId: null,
  blendMode: 0,
  opacity: 255,
  visible: true,
  locked: false,
  flags: 3,
  ...more,
});
const t = {
  composeGroups: false,
  activeFrame: 0,
  activeLayer: 0,
  layers: [
    layer("base", "Base"),
    layer("group", "Group 1", { kind: "group" }),
    layer("child", "Child", { parentId: "group" }),
  ],
  frames: [
    {
      duration: 100,
      cels: [
        { pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 },
        null,
        { pixels: top, x: 6, y: 6, opacity: 255, zIndex: 0 },
      ],
    },
  ],
};
fs.mkdirSync(".tmp/features-1-6", { recursive: true });
fs.writeFileSync(
  ".tmp/features-1-6/layers-feature.aseprite",
  m.encodeAsepriteSync(
    m.asepriteFromProject({
      image,
      timeline: t,
      palette: [
        [0, 0, 0, 255],
        [255, 255, 255, 255],
      ],
    }),
  ),
);
