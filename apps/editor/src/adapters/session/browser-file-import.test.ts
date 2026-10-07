import { describe, expect, it } from "vitest";

import { BrowserSessionPorts } from "$/adapters/session/browser-session-ports";
import {
  AsepriteCodecError,
  asepriteFromProject,
  encodeAsepriteSync,
} from "@xprite/editor-core/import-export";

function fixture(): Uint8Array {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([17, 23, 41, 255]) };
  return encodeAsepriteSync(
    asepriteFromProject({
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
    }),
  );
}

describe("Browser file import without picker type filters", () => {
  it("opens complete Aseprite animations despite missing or inaccurate file metadata", async () => {
    const ports = new BrowserSessionPorts();
    try {
      const bytes = fixture();
      for (const [name, type] of [
        ["drawing.aseprite", ""],
        ["drawing", "application/octet-stream"],
        ["drawing.bin", "image/png"],
      ]) {
        const source = ports.registerFile(new File([bytes as BlobPart], name, { type }));
        const project = await ports.decodeProject(source.source);
        expect(project?.timeline.frames.map((frame) => frame.duration)).toEqual([100, 200]);
        expect(project?.timeline.layers[0].name).toBe("Layer");
        ports.releaseSource(source.source);
      }
    } finally {
      ports.dispose();
    }
  });

  it("rejects a renamed text file through the Aseprite codec", async () => {
    const ports = new BrowserSessionPorts();
    try {
      const source = ports.registerFile(new File(["plain text"], "drawing.aseprite"));
      await expect(ports.decodeProject(source.source)).rejects.toBeInstanceOf(AsepriteCodecError);
    } finally {
      ports.dispose();
    }
  });

  it("rejects a text file on the image path with a user-facing error", async () => {
    const ports = new BrowserSessionPorts();
    try {
      const source = ports.registerFile(new File(["plain text"], "notes.txt"));
      expect(await ports.decodeProject(source.source)).toBeNull();
      await expect(ports.decode(source.source)).rejects.toThrow(/notes\.txt/);
    } finally {
      ports.dispose();
    }
  });
});
