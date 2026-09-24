import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("compose-groups [feature-1-6]", () => {
  it("compose-groups behavior", async () => {
    const b = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/editor/RasterEditor.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      "data:text/javascript;base64," + Buffer.from(b.outputFiles[0].contents).toString("base64")
    );
    const image = (v) => ({ width: 1, height: 1, data: new Uint8ClampedArray(v) }),
      cel = (pixels) => ({ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }),
      layer = (id, extra = {}) => ({
        id,
        name: id,
        visible: true,
        locked: false,
        flags: 3,
        opacity: 255,
        ...extra,
      });
    const t = {
      composeGroups: true,
      activeLayer: 2,
      activeFrame: 0,
      layers: [
        layer("base"),
        layer("group", { kind: "group", opacity: 128 }),
        layer("child", { parentId: "group", blendMode: 1 }),
      ],
      frames: [
        {
          duration: 100,
          cels: [cel(image([200, 100, 50, 255])), null, cel(image([100, 200, 50, 255]))],
        },
      ],
    };
    const encoded = await m.encodeAseprite(
        m.asepriteFromProject({ timeline: t, image: image([0, 0, 0, 0]) }),
      ),
      decoded = await m.decodeAseprite(encoded),
      project = m.projectFromAseprite(decoded);
    assert.equal(project.timeline.composeGroups, false);
    assert.equal(project.timeline.layers[1].opacity, 128);
    assert.equal(decoded.flags & 2, 2);
    const e = new m.RasterEditor();
    assert.equal(e.getSnapshot().settings.composeGroups, false);
    e.document.loadTimeline(project.timeline, 1, 1, "modern.aseprite");
    const rawSource = e.getSnapshot().document.timeline.asepriteSource,
      sourceBefore = JSON.stringify(rawSource);
    assert.deepEqual([...e.canvas.composite().data], [78, 78, 10, 255]);
    const saved = e.getSnapshot();
    e.drawing.settings.setSettings({ composeGroups: true });
    assert.deepEqual([...e.canvas.composite().data], [150, 150, 50, 255]);
    assert.equal(e.getSnapshot().dirty, saved.dirty);
    assert.equal(e.getSnapshot().canUndo, saved.canUndo);
    assert.equal(e.getSnapshot().persistenceRevision, saved.persistenceRevision);
    assert.equal(e.getSnapshot().document.timeline.asepriteSource, rawSource);
    assert.equal(JSON.stringify(rawSource), sourceBefore);
    e.timeline.renameLayer("Edited");
    e.drawing.settings.setSettings({ composeGroups: false });
    e.history.undo();
    assert.equal(e.getSnapshot().settings.composeGroups, false);
    assert.equal(e.getSnapshot().document.timeline.composeGroups, false);
    assert.deepEqual([...e.canvas.composite().data], [78, 78, 10, 255]);
    e.history.redo();
    assert.equal(e.getSnapshot().document.timeline.composeGroups, false);
    const p = m.projectFromDocument(e.getSnapshot().document),
      aseprite = m.asepriteFromProject(p);
    assert.equal(aseprite.flags & 2, 0);
    assert.equal(aseprite.layers[1].opacity, 0);
    assert.equal(aseprite.layers[1].blendMode, 0);
    assert.equal(p.timeline.layers[1].opacity, 128);
    const recovery = m.asepriteFromProject(p, { preserveGroupMetadata: true });
    assert.equal(recovery.flags & 2, 2);
    assert.equal(recovery.layers[1].opacity, 128);
    const recovered = m.projectFromAseprite(
      await m.decodeAseprite(await m.encodeAseprite(recovery)),
    );
    assert.equal(recovered.timeline.layers[1].opacity, 128);
    assert.equal(recovered.timeline.composeGroups, false);
    const other = new m.RasterEditor();
    e.drawing.settings.setSettings({ composeGroups: true });
    other.drawing.settings.applyPreferences(e.drawing.settings.capturePreferences());
    other.document.loadTimeline(recovered.timeline, 1, 1, "recovered");
    assert.equal(other.getSnapshot().document.timeline.composeGroups, true);
    assert.deepEqual([...other.canvas.composite().data], [150, 150, 50, 255]);
    const dialog = readFileSync(
      "apps/editor/src/components/timeline/timeline-dialogs/index.tsx",
      "utf8",
    ).replace(/\s+/g, " ");
    assert.ok(
      dialog.includes(
        'imageProps={ timeline?.layers[timeline.activeLayer]?.kind !== "group" || !!state?.settings.composeGroups }',
      ),
    );
    assert.ok(dialog.includes("{imageProps && ("));
    assert.ok(
      readFileSync(
        "apps/editor/src/components/dialogs/experimental-preferences/index.tsx",
        "utf8",
      ).includes("Compose groups separately"),
    );
    console.log(
      "Aseprite composeGroups: global defaultoff, modern import preserves authored metadata, preference-only cache invalidation without history/dirty, global survives undo/reload/tool-pref transfer, explicit Aseprite export zeros disabled group fields while internal recovery preserves them; group controls visibility follows preference.",
    );
  }, 60_000);
});
