import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { BrowserSessionPorts } from "$/adapters/session/browser-session-ports";
import { IndexedDbFileIdentities } from "$/adapters/storage/indexeddb/file-identities";
import { asepriteFromProject, encodeAsepriteSync } from "@xprite/editor-core/import-export";

function projectBytes() {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([17, 23, 41, 255]) };
  return encodeAsepriteSync(
    asepriteFromProject({
      image,
      timeline: {
        activeLayer: 0,
        activeFrame: 0,
        layers: [{ id: "layer", name: "Layer", visible: true, locked: false, opacity: 255 }],
        frames: [{ duration: 100, cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }] }],
      },
    }),
  );
}

describe("browser source fingerprints", () => {
  it("reads an Aseprite source once for both decoding and exact content identity", async () => {
    const factory = new IDBFactory();
    const ports = new BrowserSessionPorts({ factory, databaseName: "source-identity-test" });
    let reads = 0;
    class CountedFile extends File {
      override arrayBuffer() {
        reads++;
        return super.arrayBuffer();
      }
    }
    const bytes = projectBytes();
    const file = new CountedFile([bytes as unknown as BlobPart], "same.aseprite");
    const source = ports.registerFile(file);
    try {
      const project = await ports.decodeProject(source.source);
      expect(project?.image.data).toEqual(new Uint8ClampedArray([17, 23, 41, 255]));
      const identity = await ports.identifySource(source.source);
      expect(reads).toBe(1);
      const independent = new IndexedDbFileIdentities({
        factory,
        databaseName: "independent-identities",
      });
      try {
        expect(
          await independent.identify(new File([bytes as unknown as BlobPart], file.name)),
        ).toBe(identity);
      } finally {
        independent.close();
      }
      ports.releaseSource(source.source);
      expect(await ports.identifySource(source.source)).toBeNull();
      await expect(ports.decodeProject(source.source)).rejects.toThrow("no longer available");
    } finally {
      ports.dispose();
    }
  });
});
