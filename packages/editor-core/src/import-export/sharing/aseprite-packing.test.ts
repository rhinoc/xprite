import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { encodeAsepriteSync } from "$/import-export/aseprite/encode";
import { asepriteFromProject, projectFromDocument } from "$/import-export/aseprite/project";
import {
  sharedAsepriteCandidates,
  restoreSharedAseprite,
} from "$/import-export/sharing/aseprite-packing";

const WIDTH = 17;
const HEIGHT = 19;

function fixture(colors: number): Uint8Array {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let index = 0; index < WIDTH * HEIGHT; index++) {
    const color = index % colors;
    data.set([color & 255, color >>> 8, (color * 17) & 255, color % 3 ? 255 : 0], index * 4);
  }
  const editor = new RasterEditor({ width: WIDTH, height: HEIGHT, data });
  const sprite = asepriteFromProject(projectFromDocument(editor.getSnapshot().document!));
  const frame = sprite.frames[0];
  sprite.frames = [
    frame,
    {
      ...frame,
      index: 1,
      duration: 125,
      cels: frame.cels.map((cel) => ({
        ...cel,
        pixels:
          colors === 1
            ? cel.pixels?.slice()
            : cel.pixels?.map((byte, index, pixels) => pixels[(index + 4) % pixels.length]),
      })),
    },
  ];
  return encodeAsepriteSync(sprite);
}

describe("reversible share packing", () => {
  it.each([1, 2, 3, 8, 16, 17, 64, 128, 256, 257])(
    "preserves every ASE byte, hidden RGB and animation with %i colors",
    (colors) => {
      const original = fixture(colors);
      for (const packed of sharedAsepriteCandidates(original, "中文🎨.aseprite")) {
        const restored = restoreSharedAseprite(packed, original.length);
        assert.equal(restored.name, "中文🎨.aseprite");
        assert.deepEqual(restored.bytes, original);
      }
    },
  );

  it("rejects truncated, altered, trailing and oversized payloads", () => {
    const original = fixture(16);
    for (const packed of sharedAsepriteCandidates(original, "sprite.aseprite")) {
      assert.throws(() =>
        restoreSharedAseprite(packed.subarray(0, packed.length - 1), original.length),
      );
      const changed = packed.slice();
      changed[changed.length - 1] ^= 1;
      assert.throws(() => restoreSharedAseprite(changed, original.length));
      assert.throws(() => restoreSharedAseprite(new Uint8Array([...packed, 0]), original.length));
      assert.throws(() => restoreSharedAseprite(packed, original.length - 1));
    }
  });
});
