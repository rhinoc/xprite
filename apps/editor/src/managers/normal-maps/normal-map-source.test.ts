import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  resolveNormalMapSourceDocument,
  type NormalMapRealDocumentRecord,
} from "$/managers/normal-maps/normal-map-source";
import { RasterEditor } from "@xprite/editor-core";
import type { PixelBuffer } from "@xprite/editor-core/base";

function solidImage(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { width, height, data };
}

describe("normal map source document isolation", () => {
  it("keeps Lighting Preview bound to the real sprite while temporary Sprite Sheet live preview is active", () => {
    const core = new RasterEditor(solidImage(64, 64, [200, 120, 60, 255]), "character.aseprite");
    const normalLayerId = core.imageEditing.applyNormalMap(
      [{ frame: 0, pixels: solidImage(64, 64, [128, 128, 255, 255]) }],
      "Normal",
    );
    assert.ok(normalLayerId);

    const owner = {};
    const initialSnapshot = core.getSnapshot();
    const documentKey = initialSnapshot.document!.id ?? initialSnapshot.document!.name;
    let lastReal: NormalMapRealDocumentRecord | null = null;

    // Before Sprite Sheet preview opens, the resolved document is the real 64x64 sprite.
    const before = resolveNormalMapSourceDocument(
      core,
      initialSnapshot,
      owner,
      documentKey,
      lastReal,
    );
    lastReal = before.realRecord;
    assert.equal(before.document?.width, 64);
    assert.equal(before.document?.height, 64);
    assert.equal(before.document?.timeline?.layers.length, 2);
    assert.ok(before.document?.timeline?.layers.some((layer) => layer.id === normalLayerId));
    assert.equal(before.pixelRevision, initialSnapshot.pixelRevision);

    // Export -> Sprite Sheet with Preview checked publishes a temporary 3200x64 sheet document.
    core.importExport.previewSpriteSheet(solidImage(3200, 64, [10, 20, 30, 255]));
    const duringSnapshot = core.getSnapshot();
    assert.equal(duringSnapshot.document?.width, 3200);
    assert.equal(duringSnapshot.document?.height, 64);
    assert.equal(duringSnapshot.document?.timeline?.layers.length, 1);

    // Lighting Preview ignores the temporary 3200x64 sheet and stays pinned to the real 64x64 sprite.
    const during = resolveNormalMapSourceDocument(
      core,
      duringSnapshot,
      owner,
      documentKey,
      lastReal,
    );
    lastReal = during.realRecord;
    assert.equal(during.document?.width, 64);
    assert.equal(during.document?.height, 64);
    assert.equal(during.document?.timeline?.layers.length, 2);
    assert.ok(during.document?.timeline?.layers.some((layer) => layer.id === normalLayerId));
    assert.equal(during.pixelRevision, initialSnapshot.pixelRevision);

    // Cold-start while Sprite Sheet preview is already active falls back to committed persistence snapshot.
    const coldStart = resolveNormalMapSourceDocument(
      core,
      duringSnapshot,
      owner,
      documentKey,
      null,
    );
    assert.equal(coldStart.document?.width, 64);
    assert.equal(coldStart.document?.height, 64);
    assert.equal(coldStart.document?.timeline?.layers.length, 2);
    assert.ok(coldStart.document?.timeline?.layers.some((layer) => layer.id === normalLayerId));

    // Clearing the Sprite Sheet preview resumes tracking real document snapshots.
    core.importExport.previewSpriteSheet(null);
    const afterSnapshot = core.getSnapshot();
    const after = resolveNormalMapSourceDocument(core, afterSnapshot, owner, documentKey, lastReal);
    assert.equal(after.document?.width, 64);
    assert.equal(after.document?.height, 64);
    assert.equal(after.pixelRevision, afterSnapshot.pixelRevision);
  });
});
