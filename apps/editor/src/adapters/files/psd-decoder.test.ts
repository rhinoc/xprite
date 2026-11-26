import { writePsdUint8Array } from "ag-psd";
import { describe, expect, it } from "vitest";

import { decodePsdProjectSync } from "$/adapters/files/psd-decoder";
import { BrowserSessionPorts } from "$/adapters/session/browser-session-ports";
import { PsdCodecError } from "@xprite/editor-core/import-export";

function createSamplePsd(): Uint8Array {
  const red = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  const blue = new Uint8ClampedArray([
    0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
  ]);
  return writePsdUint8Array({
    width: 2,
    height: 2,
    children: [
      {
        name: "Base",
        left: 0,
        top: 0,
        right: 2,
        bottom: 2,
        imageData: { width: 2, height: 2, data: red },
      },
      {
        name: "Tint",
        left: 0,
        top: 0,
        right: 2,
        bottom: 2,
        blendMode: "multiply",
        clipping: true,
        imageData: { width: 2, height: 2, data: blue },
      },
    ],
  });
}

describe("PSD decoder and browser import routing", () => {
  it("decodes PSD layers, blend modes, and clipping masks without DOM globals", () => {
    const project = decodePsdProjectSync(createSamplePsd());
    expect(project.timeline.layers.map((layer) => layer.name)).toEqual(["Base", "Tint"]);
    expect(project.timeline.layers[1].blendMode).toBe(1);
    const tintCel = project.timeline.frames[0].cels[1]!;
    // Top row is clipped to opaque base; bottom row is clipped to transparent base.
    expect(tintCel.pixels.data[3]).toBe(255);
    expect(tintCel.pixels.data[11]).toBe(0);
  });

  it("routes PSDs by magic bytes, rejects corrupt .psd, and lets PNG-as-.psd fall through", async () => {
    const ports = new BrowserSessionPorts();
    try {
      const psdBytes = createSamplePsd();
      const renamedPsd = ports.registerFile(new File([psdBytes as BlobPart], "artwork.bin"));
      const decoded = await ports.decodeProject(renamedPsd.source);
      expect(decoded?.timeline.layers.map((layer) => layer.name)).toEqual(["Base", "Tint"]);
      ports.releaseSource(renamedPsd.source);

      const brokenPsd = ports.registerFile(new File(["not a psd"], "broken.psd"));
      await expect(ports.decodeProject(brokenPsd.source)).rejects.toBeInstanceOf(PsdCodecError);
      ports.releaseSource(brokenPsd.source);

      const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const pngNamedPsd = ports.registerFile(new File([pngHeader], "actually-png.psd"));
      expect(await ports.decodeProject(pngNamedPsd.source)).toBeNull();
      ports.releaseSource(pngNamedPsd.source);
    } finally {
      ports.dispose();
    }
  });
});
