import { zlibSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { PixelStorageFormat } from "$/base/primitives";
import { AsepriteCodecError } from "$/import-export/aseprite/decode";
import { encodeAsepriteSync } from "$/import-export/aseprite/encode";
import { asepriteFromProject } from "$/import-export/aseprite/project";
import {
  decodeAsepriteProject,
  decodeAsepriteProjectSync,
} from "$/import-export/aseprite/project-decode";

function fixture() {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([17, 23, 41, 255]) };
  const sprite = asepriteFromProject({
    image,
    timeline: {
      activeLayer: 0,
      activeFrame: 0,
      layers: [{ id: "layer", name: "Layer", visible: true, locked: false, opacity: 255 }],
      frames: [
        { duration: 100, cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }] },
        { duration: 200, cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }] },
      ],
    },
  });
  sprite.userData = { text: "authored metadata" };
  const cel = sprite.frames[0].cels[0];
  cel.encodedPixels = {
    format: PixelStorageFormat.ZlibRgba,
    bytes: zlibSync(cel.pixels!),
    byteLength: cel.pixels!.byteLength,
    hasHiddenRgb: false,
  };
  return encodeAsepriteSync(sprite, { preserveCelCompression: true });
}

describe("Aseprite project opening", () => {
  it("rejects a canvas allocation before invoking a caller's inflater", async () => {
    const inflate = vi.fn(() => new Uint8Array(4));
    const canvasError = new Error("formatted canvas error");
    await expect(
      decodeAsepriteProject(fixture(), {
        inflate,
        maxCanvasBytes: 3,
        errors: { canvas: () => canvasError },
      }),
    ).rejects.toBe(canvasError);
    expect(inflate).not.toHaveBeenCalled();
    expect(() => decodeAsepriteProjectSync(fixture(), { maxCanvasBytes: 3 })).toThrow(
      AsepriteCodecError,
    );
  });

  it("preserves linked cel identities and metadata with either projection strategy", async () => {
    const eager = await decodeAsepriteProject(fixture());
    const lazy = decodeAsepriteProjectSync(fixture(), {
      takeOwnership: true,
      deferPixels: true,
      takeProjectOwnership: true,
    });
    for (const project of [eager, lazy]) {
      expect(project.image.data).toEqual(new Uint8ClampedArray([17, 23, 41, 255]));
      expect(project.timeline.frames.map((frame) => frame.duration)).toEqual([100, 200]);
      expect(project.timeline.frames[0].cels[0]?.pixels).toBe(
        project.timeline.frames[1].cels[0]?.pixels,
      );
      expect(project.timeline.userData?.text).toBe("authored metadata");
    }
    expect(eager.timeline.frames[0].cels[0]?.pixels.encoded).toBeUndefined();
    expect(lazy.timeline.frames[0].cels[0]?.pixels.encoded).toBeDefined();
  });

  it("keeps structured preflight issues when the input is rejected", async () => {
    const preflight = vi.fn((result) => new AsepriteCodecError("formatted issue", result.issues));
    await expect(
      decodeAsepriteProject(new Uint8Array(2), { errors: { preflight } }),
    ).rejects.toMatchObject({ message: "formatted issue", issues: expect.any(Array) });
    expect(preflight).toHaveBeenCalledTimes(1);
  });
});
