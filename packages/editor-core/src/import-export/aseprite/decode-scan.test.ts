import { describe, expect, it } from "vitest";

import {
  decodeAseprite,
  decodeAsepriteSync,
  AsepriteCodecError,
} from "$/import-export/aseprite/decode";
import { encodeAseprite, encodeAsepriteSync } from "$/import-export/aseprite/encode";
import { AsepriteCelType } from "$/import-export/aseprite/model";
import { asepriteFromProject } from "$/import-export/aseprite/project";

function fixture() {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([17, 23, 41, 255]) };
  const sprite = asepriteFromProject({
    image,
    timeline: {
      activeLayer: 0,
      activeFrame: 0,
      layers: [{ id: "layer", name: "Layer", visible: true, locked: false, opacity: 255 }],
      frames: [{ duration: 100, cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }] }],
    },
  });
  sprite.userData = { text: "Retain authored metadata" };
  sprite.frames.push({
    index: 1,
    duration: 200,
    cels: [{ ...sprite.frames[0].cels[0], type: AsepriteCelType.Linked, linkedFrame: 0 }],
    chunks: [],
  });
  return sprite;
}

describe("Aseprite scan reuse and input ownership", () => {
  it("inspects once before inflating and retains linked cels and authored metadata", async () => {
    const input = await encodeAseprite(fixture(), {
      compress: true,
      deflate: (bytes) => bytes.slice(),
    });
    const sequence: string[] = [];
    const sprite = await decodeAseprite(input, {
      takeOwnership: true,
      onPreflight(result) {
        sequence.push("inspect");
        expect(result.ok).toBe(true);
        expect(result.header).toMatchObject({ width: 1, height: 1, frames: 2 });
      },
      inflate(bytes, expected) {
        sequence.push("inflate");
        expect(sequence[0]).toBe("inspect");
        expect(bytes.byteLength).toBe(expected);
        return bytes;
      },
    });
    expect(sequence).toEqual(["inspect", "inflate"]);
    expect(sprite.frames[0].cels[0].pixels).toEqual(new Uint8Array([17, 23, 41, 255]));
    expect(sprite.frames[1].cels[0].pixels).toBe(sprite.frames[0].cels[0].pixels);
    expect(sprite.userData?.text).toBe("Retain authored metadata");
    input.fill(0);
    expect(sprite.frames[0].cels[0].pixels).toEqual(new Uint8Array([17, 23, 41, 255]));
    const reopened = decodeAsepriteSync(encodeAsepriteSync(sprite));
    expect(reopened.userData).toEqual(sprite.userData);
    expect(reopened.frames[1].cels[0].linkedFrame).toBe(0);
  });

  it("keeps borrowed bytes and inspection diagnostics separate from the validated scan", async () => {
    const bytes = encodeAsepriteSync(fixture());
    const sprite = await decodeAseprite(bytes, {
      onPreflight(result) {
        bytes.fill(0);
        result.header!.width = 500;
        result.issues.length = 0;
      },
    });
    expect(sprite.width).toBe(1);
    expect(sprite.userData?.text).toBe("Retain authored metadata");
    expect(sprite.frames[0].cels[0].pixels).toEqual(new Uint8Array([17, 23, 41, 255]));
  });

  it("cannot clear fatal resource issues through the inspection callback", async () => {
    const bytes = encodeAsepriteSync(fixture());
    let inflated = false;
    await expect(
      decodeAseprite(bytes, {
        limits: { maxDecodedBytes: 3 },
        onPreflight(result) {
          expect(result.ok).toBe(false);
          result.ok = true;
          result.issues.length = 0;
        },
        inflate: () => {
          inflated = true;
          return new Uint8Array(4);
        },
      }),
    ).rejects.toBeInstanceOf(AsepriteCodecError);
    expect(inflated).toBe(false);
  });

  it("uses the same safe inspection contract for synchronous decoding", () => {
    const encoded = encodeAsepriteSync(fixture());
    const padded = new Uint8Array(encoded.length + 8);
    padded.set(encoded, 4);
    const input = padded.subarray(4, encoded.length + 4);
    const sprite = decodeAsepriteSync(input, { onPreflight: () => input.fill(0) });
    expect(sprite.width).toBe(1);
    expect(sprite.frames[0].cels[0].pixels).toEqual(new Uint8Array([17, 23, 41, 255]));
  });
});
