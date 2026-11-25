import { describe, expect, it } from "vitest";

import { AgentToolsManager } from "$/managers/agent/agent-tools-manager";
import { AgentToolName, type AgentToolsPort } from "$/managers/ports/agent-tools";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { RasterEditor } from "@xprite/editor-core";
import { inflateZlibExact, type PixelBuffer } from "@xprite/editor-core/base";
import {
  AsepriteCelType,
  asepriteFromProject,
  decodeAseprite,
  encodeAseprite,
  rasterAnimationProject,
} from "@xprite/editor-core/import-export";

function createTestPort(): AgentToolsPort {
  return {
    publish: () => () => {},
    encodePng: async () => new Uint8Array(),
    encodeBase64: (bytes) => Buffer.from(bytes).toString("base64"),
    decodeBase64: (value) => new Uint8Array(Buffer.from(value, "base64")),
    decodeImage: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
  };
}

function makeAnimatedSprite(width: number, height: number, frameCount: number): RasterEditor {
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 40;
      data[i + 1] = 80;
      data[i + 2] = 160;
      data[i + 3] = 255;
    }
    // Paint a distinct per-frame accent so cels are unique rather than linked.
    const x = frame % width;
    const y = Math.floor(frame / width) % height;
    const accent = (y * width + x) * 4;
    data[accent] = 255;
    data[accent + 1] = (frame * 12) % 256;
    data[accent + 2] = 32;
    data[accent + 3] = 255;
    return { pixels: { width, height, data } as PixelBuffer, durationMs: 100 };
  });
  const project = rasterAnimationProject({ width, height, frames });
  const editor = new RasterEditor(frames[0].pixels, "feast.aseprite");
  editor.document.loadTimeline(project.timeline, width, height, "feast.aseprite");
  return editor;
}

describe("agent aseprite export compression", () => {
  it("compresses cels so multi-frame .aseprite exports stay compact and round-trip cleanly", async () => {
    const core = makeAnimatedSprite(160, 64, 20);
    const slot = {
      id: "view-1",
      documentId: "doc-1",
      core,
      session: { getSnapshot: () => ({}) },
    };
    const workspace = {
      getSnapshot: () => ({ tabs: [{ id: "view-1" }], activeId: "view-1" }),
      getSlot: () => slot,
    };
    const port = createTestPort();
    const manager = new AgentToolsManager(
      workspace as unknown as DocumentWorkspace,
      port,
      () => {},
    );

    const response = await manager.execute(AgentToolName.ExportDocument, {
      documentId: "doc-1",
      format: "aseprite",
      output: "base64",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const data = response.data as {
      filename: string;
      byteLength: number;
      base64: string;
    };
    const exportedBytes = port.decodeBase64(data.base64);
    expect(exportedBytes.byteLength).toBe(data.byteLength);

    const snapshot = core.getPersistenceSnapshot()!;
    const uncompressedBytes = await encodeAseprite(
      asepriteFromProject(
        {
          image: { width: snapshot.document.width, height: snapshot.document.height },
          timeline: snapshot.document.timeline!,
          palette: snapshot.document.palette,
        },
        { preserveGroupMetadata: true },
      ),
    );

    // 160x64x4x20 raw pixel data is ~819 KB; compressed flat frames should be >20x smaller.
    expect(exportedBytes.byteLength).toBeLessThan(uncompressedBytes.byteLength / 20);

    const decoded = await decodeAseprite(exportedBytes, {
      inflate: (compressed, expected) => inflateZlibExact(compressed, expected),
    });
    expect(decoded.width).toBe(160);
    expect(decoded.height).toBe(64);
    expect(decoded.frames).toHaveLength(20);
    const compressedCels = decoded.frames.flatMap((frame) =>
      frame.cels.filter((cel) => cel.type === AsepriteCelType.Compressed),
    );
    expect(compressedCels.length).toBeGreaterThan(0);

    // Verify frame 0 and a later frame round-trip pixel-for-pixel.
    const rawDecoded = await decodeAseprite(uncompressedBytes);
    expect(decoded.frames[0].cels[0].pixels).toEqual(rawDecoded.frames[0].cels[0].pixels);
    expect(decoded.frames[19].cels[0].pixels).toEqual(rawDecoded.frames[19].cels[0].pixels);
  });
});
