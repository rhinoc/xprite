import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { decodeAseprite, decodeAsepriteSync } from "$/import-export/aseprite/decode";
import { encodeAseprite, encodeAsepriteSync } from "$/import-export/aseprite/encode";
import { AsepriteTagDirection } from "$/import-export/aseprite/model";
import {
  asepriteFromProject,
  projectFromAseprite,
  projectFromDocument,
} from "$/import-export/aseprite/project";
import { timelineTags } from "$/timeline/tags";

describe("ASE tag User Data ordering", () => {
  it("retains empty positions before and between tags with data in both encoders", async () => {
    const core = new RasterEditor({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    for (const [index, userData] of [
      undefined,
      { text: "Second tag", color: [12, 34, 56, 78] as [number, number, number, number] },
      undefined,
      { text: "Fourth tag", properties: new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0]) },
      undefined,
    ].entries())
      core.timeline.setAnimationTag(index, {
        name: `Tag ${index}`,
        from: 0,
        to: 0,
        color: [0, 0, 0, 255],
        direction: AsepriteTagDirection.Forward,
        repeat: 0,
        ...(userData ? { userData } : {}),
      });
    core.timeline.addLayer("Layer after tags");
    core.timeline.setLayerProperties({ userData: { text: "Layer data" } });
    const document = core.getSnapshot().document!;
    const sprite = asepriteFromProject(projectFromDocument(document));
    const expected = sprite.tags.map((tag) => ({ ...tag, userData: tag.userData ?? {} }));
    const before = structuredClone(sprite);
    const sync = decodeAsepriteSync(encodeAsepriteSync(sprite));
    const asyncDecoded = await decodeAseprite(await encodeAseprite(sprite));
    for (const decoded of [sync, asyncDecoded]) {
      assert.deepEqual(decoded.tags, expected);
      assert.equal(decoded.layers[1].userData?.text, "Layer data");
      const reopened = new RasterEditor();
      const project = projectFromAseprite(decoded);
      reopened.document.loadTimeline(project.timeline, 1, 1, "Tags.aseprite");
      assert.deepEqual(timelineTags(reopened.getSnapshot().document!.timeline!), expected);
    }
    assert.deepEqual(sprite, before, "writing placeholders must not mutate tag metadata");
  });
});
