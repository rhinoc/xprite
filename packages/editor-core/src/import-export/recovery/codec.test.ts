import { strToU8, zlibSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { PixelStorageFormat } from "$/base";
import {
  createEncodedPixelBuffer,
  encodedPixels,
  type EditorPersistenceSnapshot,
} from "$/document";
import { EDITOR_ASEPRITE_LIMITS } from "$/import-export/aseprite";
import { decodeRecoverySnapshot, encodeRecoverySnapshot } from "$/import-export/recovery/codec";
import { decodeRecoveryEnvelope, RECOVERY_HEADER_BYTES } from "$/import-export/recovery/envelope";

function snapshot(): EditorPersistenceSnapshot {
  const width = 32;
  const pixels = { width, height: 1, data: new Uint8ClampedArray(width * 4) };
  const other = { width, height: 1, data: new Uint8ClampedArray(width * 4) };
  pixels.data.set([91, 7, 9, 255]);
  other.data.set([23, 7, 9, 255]);
  const cel = { pixels, x: 0, y: 0, opacity: 255, zIndex: 0 };
  return {
    version: 1,
    dirty: true,
    document: {
      name: "drawing.png",
      format: "png",
      width,
      height: 1,
      selection: null,
      layer: { name: "Ink", x: 0, y: 0, visible: true, locked: false, pixels },
      timeline: {
        composeGroups: false,
        activeFrame: 0,
        activeLayer: 1,
        loopCount: 3,
        layers: [
          {
            id: "group",
            name: "Group",
            kind: "group",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 83,
            blendMode: 3,
          },
          {
            id: "ink",
            name: "Ink",
            parentId: "group",
            kind: "image",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 255,
            blendMode: 0,
          },
        ],
        frames: [
          { duration: 100, cels: [null, cel] },
          { duration: 200, cels: [null, { ...cel }] },
          { duration: 300, cels: [null, { ...cel, pixels: other }] },
        ],
      },
    },
  };
}

describe("portable recovery codec", () => {
  it("preserves Unicode names and rejects malformed UTF-8 metadata", async () => {
    const source = snapshot();
    source.document.name = "草稿🎨.png";
    const bytes = await encodeRecoverySnapshot(source, zlibSync);
    expect((await decodeRecoverySnapshot(bytes)).document.name).toBe(source.document.name);
    const metadataLength = new DataView(bytes.buffer).getUint32(12, true);
    const metadata = bytes.subarray(RECOVERY_HEADER_BYTES, RECOVERY_HEADER_BYTES + metadataLength);
    const multibyteStart = metadata.findIndex((value) => value >= 0x80);
    const malformed = bytes.slice();
    malformed[RECOVERY_HEADER_BYTES + multibyteStart] = 0xff;
    expect(() => decodeRecoveryEnvelope(malformed)).toThrow(/UTF-8/);
  });

  it("preserves the project-wide expanded budget independently of the encoded file budget", async () => {
    const source = snapshot();
    const dimension = 8_000;
    // Deliberately forged compressed backing: declared frames exceed the file
    // byte budget, but fit the expanded project budget. The injected inflater
    // stops immediately, so this regression never allocates those declared pixels.
    const compressed = zlibSync(new Uint8Array(4));
    source.document.width = dimension;
    source.document.height = dimension;
    const timeline = source.document.timeline!;
    timeline.frames = timeline.frames.map((frame) => ({
      ...frame,
      cels: [
        null,
        {
          ...frame.cels[1]!,
          pixels: createEncodedPixelBuffer(dimension, dimension, {
            format: PixelStorageFormat.ZlibRgba,
            byteLength: dimension * dimension * 4,
            bytes: compressed,
            hasHiddenRgb: false,
          }),
        },
      ],
    }));
    source.document.layer.pixels = timeline.frames[0].cels[1]!.pixels;
    const bytes = await encodeRecoverySnapshot(source, zlibSync);
    expect(bytes.byteLength).toBeLessThan(4_096);
    const stopInflation = new Error("Stop before expanded allocation");
    const inflate = vi.fn(() => {
      throw stopInflation;
    });
    await expect(decodeRecoverySnapshot(bytes, { inflate })).rejects.toBe(stopInflation);
    expect(inflate).toHaveBeenCalledOnce();
    inflate.mockClear();
    await expect(
      decodeRecoverySnapshot(bytes, {
        inflate,
        maxProjectBytes: EDITOR_ASEPRITE_LIMITS.maxFileBytes,
      }),
    ).rejects.toThrow(/preflight/);
    expect(inflate).not.toHaveBeenCalled();
  });

  it("restores authored groups, linked cels and local navigation without browser file APIs", async () => {
    const source = snapshot();
    const before = structuredClone(source);
    vi.stubGlobal("Blob", undefined);
    try {
      const bytes = await encodeRecoverySnapshot(source, zlibSync);
      expect(source).toEqual(before);
      const restored = await decodeRecoverySnapshot(bytes);
      const document = restored.document;
      expect(document.name).toBe("drawing.png");
      expect(document.format).toBe("png");
      expect(restored.dirty).toBe(true);
      expect(document.timeline).toMatchObject({
        activeFrame: 0,
        activeLayer: 1,
        composeGroups: false,
        loopCount: 3,
      });
      expect(document.timeline!.layers[0]).toMatchObject({ opacity: 83, blendMode: 3 });
      const frames = document.timeline!.frames;
      expect(frames.map((frame) => frame.duration)).toEqual([100, 200, 300]);
      expect(frames[0].cels[1]!.pixels).toBe(frames[1].cels[1]!.pixels);
      expect(encodedPixels(frames[2].cels[1]!.pixels)).toBeDefined();
      // A caller can recycle the serialized envelope after decoding, including
      // before an inactive compressed frame is first read.
      bytes.fill(0);
      expect(frames[2].cels[1]!.pixels.data[0]).toBe(23);
      expect(document.layer.pixels.data).toEqual(source.document.layer.pixels.data);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects invalid navigation and resource bounds before replacing a document", async () => {
    const source = snapshot();
    const bytes = await encodeRecoverySnapshot(source, zlibSync);
    await expect(decodeRecoverySnapshot(bytes, { maxProjectBytes: 1 })).rejects.toThrow();
    await expect(decodeRecoverySnapshot(bytes.subarray(0, bytes.length - 1))).rejects.toThrow(
      /bounds/,
    );
    const badMagic = bytes.slice();
    badMagic[0] = 0;
    await expect(decodeRecoverySnapshot(badMagic)).rejects.toThrow(/magic/);
    const envelope = decodeRecoveryEnvelope(bytes);
    const metadata = strToU8(JSON.stringify({ ...envelope.metadata, activeFrame: 9 }));
    const malformed = new Uint8Array(
      RECOVERY_HEADER_BYTES + metadata.length + envelope.project.length,
    );
    malformed.set(bytes.subarray(0, RECOVERY_HEADER_BYTES));
    new DataView(malformed.buffer).setUint32(12, metadata.length, true);
    malformed.set(metadata, RECOVERY_HEADER_BYTES);
    malformed.set(envelope.project, RECOVERY_HEADER_BYTES + metadata.length);
    await expect(decodeRecoverySnapshot(malformed)).rejects.toThrow(/active cel/);
  });
});
