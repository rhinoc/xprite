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
const base = { width: 16, height: 16, data: new Uint8ClampedArray(1024) };
for (let i = 0; i < 256; i++) base.data.set([255, 255, 255, 255], i * 4);
const photo = { width: 32, height: 32, data: new Uint8ClampedArray(4096) };
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 32; x++)
    photo.data.set(
      [(x * 31 + y * 13) % 256, (x * 7 + y * 29) % 256, (x * 19 + y * 17) % 256, 255],
      (y * 32 + x) * 4,
    );
const l = (id, name, flags) => ({
  id,
  name,
  kind: "image",
  parentId: null,
  blendMode: 0,
  opacity: 255,
  visible: true,
  locked: false,
  flags,
});
const t = {
  composeGroups: false,
  activeFrame: 0,
  activeLayer: 0,
  layers: [l("base", "Base", 3), l("ref", "Reference Layer 1", 67)],
  frames: [
    {
      duration: 100,
      cels: [
        { pixels: base, x: 0, y: 0, opacity: 255, zIndex: 0 },
        {
          pixels: photo,
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
          preciseBounds: { x: 0, y: 0, width: 16, height: 16 },
        },
      ],
    },
  ],
};
fs.mkdirSync(".tmp/features-1-6", { recursive: true });
fs.writeFileSync(
  ".tmp/features-1-6/reference-viewport.aseprite",
  m.encodeAsepriteSync(
    m.asepriteFromProject({
      image: base,
      timeline: t,
      palette: [
        [0, 0, 0, 255],
        [255, 255, 255, 255],
      ],
    }),
  ),
);
