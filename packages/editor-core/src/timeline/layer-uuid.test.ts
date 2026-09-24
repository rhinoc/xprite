import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { decodeAsepriteSync } from "$/import-export/aseprite/decode";
import { encodeAsepriteSync } from "$/import-export/aseprite/encode";
import { asepriteFromProject, projectFromDocument } from "$/import-export/aseprite/project";
import { ensureLayerUuids } from "$/timeline/layer-uuid";
import type { TimelineLayer } from "$/timeline/types";

function editor() {
  return new RasterEditor({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, "UUIDs");
}

function uuids(layers: readonly TimelineLayer[]): string[] {
  return layers.map((layer) => {
    const uuid = layer.source?.uuid;
    assert.ok(uuid);
    assert.equal(uuid.byteLength, 16);
    assert.ok(uuid.some((byte) => byte !== 0));
    return [...uuid].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  });
}

describe("ASE layer UUID lifetime", () => {
  it("keeps new and duplicated UUIDs stable through undo, recovery and repeated saves", () => {
    const core = editor();
    core.sprite.setProperties({ useLayerUuids: true });
    const original = uuids(core.getSnapshot().document!.timeline!.layers)[0];
    core.timeline.addLayer("New");
    const newLayer = uuids(core.getSnapshot().document!.timeline!.layers);
    assert.equal(new Set(newLayer).size, 2);
    assert.equal(newLayer[0], original);

    core.timeline.duplicateLayer();
    const duplicated = uuids(core.getSnapshot().document!.timeline!.layers);
    assert.equal(new Set(duplicated).size, 3);
    assert.deepEqual(duplicated.slice(0, 2), newLayer);
    core.history.undo();
    assert.deepEqual(uuids(core.getSnapshot().document!.timeline!.layers), newLayer);
    core.history.redo();
    assert.deepEqual(uuids(core.getSnapshot().document!.timeline!.layers), duplicated);

    const document = core.getSnapshot().document!;
    const before = structuredClone(document);
    const save = () =>
      decodeAsepriteSync(encodeAsepriteSync(asepriteFromProject(projectFromDocument(document))));
    assert.deepEqual(
      save().layers.map((layer) => layer.uuid),
      save().layers.map((layer) => layer.uuid),
    );
    assert.deepEqual(document, before, "saving must not change document identity or history");

    const recovered = editor();
    const snapshot = core.getPersistenceSnapshot();
    assert.ok(snapshot);
    recovered.restorePersistenceSnapshot(snapshot);
    assert.deepEqual(uuids(recovered.getSnapshot().document!.timeline!.layers), duplicated);
    recovered.timeline.addLayer("After recovery");
    const afterRecovery = uuids(recovered.getSnapshot().document!.timeline!.layers);
    assert.equal(new Set(afterRecovery).size, 4);
    assert.deepEqual(afterRecovery.slice(0, 3), duplicated);
  });

  it("assigns distinct identities to copied ranges and pasted layer trees", () => {
    const core = editor();
    core.sprite.setProperties({ useLayerUuids: true });
    core.timeline.addLayer("Source");
    const originals = uuids(core.getSnapshot().document!.timeline!.layers);
    core.timeline.transferTimelineRange({ kind: "layers", frames: [0], layers: [1] }, 0, 1, true);
    let timeline = core.getSnapshot().document!.timeline!;
    assert.equal(new Set(uuids(timeline.layers)).size, 3);
    assert.deepEqual(uuids(timeline.layers).slice(0, 2), originals);

    core.timeline.setTimelineRange({ kind: "layers", frames: [0], layers: [1] });
    const clipboard = core.clipboard.copyTimelineSelection();
    assert.ok(clipboard);
    assert.equal(core.clipboard.pasteTimelineClipboard(clipboard), true);
    assert.equal(core.clipboard.pasteTimelineClipboard(clipboard), true);
    timeline = core.getSnapshot().document!.timeline!;
    assert.equal(new Set(uuids(timeline.layers)).size, 5);
  });

  it("preserves imported UUIDs and assigns identity to new groups", () => {
    const core = editor();
    core.sprite.setProperties({ useLayerUuids: true });
    const imported = core.getSnapshot().document!.timeline!;
    const original = uuids(imported.layers)[0];
    const other = editor();
    other.document.loadTimeline(imported, 1, 1, "Imported.aseprite");
    assert.equal(uuids(other.getSnapshot().document!.timeline!.layers)[0], original);
    assert.equal(other.getSnapshot().dirty, false);
    assert.equal(other.getSnapshot().canUndo, false);
    other.timeline.addGroup("Group");
    assert.equal(new Set(uuids(other.getSnapshot().document!.timeline!.layers)).size, 2);
  });

  it("does not create UUIDs while disabled, and regenerates them when re-enabled", () => {
    const core = editor();
    core.timeline.addLayer("Disabled");
    assert.ok(core.getSnapshot().document!.timeline!.layers.every((layer) => !layer.source?.uuid));
    core.sprite.setProperties({ useLayerUuids: true });
    const enabled = uuids(core.getSnapshot().document!.timeline!.layers);
    core.sprite.setProperties({ useLayerUuids: false });
    core.timeline.addLayer("Still disabled");
    assert.ok(core.getSnapshot().document!.timeline!.layers.every((layer) => !layer.source?.uuid));
    core.sprite.setProperties({ useLayerUuids: true });
    const reenabled = uuids(core.getSnapshot().document!.timeline!.layers);
    assert.equal(new Set(reenabled).size, 3);
    assert.ok(reenabled.every((uuid) => !enabled.includes(uuid)));
    const timeline = core.getSnapshot().document!.timeline!;
    assert.equal(ensureLayerUuids(timeline), timeline, "normalization is idempotent");
  });
});
