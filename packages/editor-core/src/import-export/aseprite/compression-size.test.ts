import assert from "node:assert/strict";

import { zlibSync, unzlibSync } from "fflate";
import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { decodeAseprite } from "$/import-export/aseprite/decode";
import { encodeAseprite } from "$/import-export/aseprite/encode";
import { AsepriteCelType } from "$/import-export/aseprite/model";
import { asepriteFromProject, projectFromDocument } from "$/import-export/aseprite/project";

describe("ASE cel compression size", () => {
  it("stores tiny cels raw when compression would increase file size", async () => {
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([255, 17, 42, 0]) };
    const editor = new RasterEditor(pixels);
    const sprite = asepriteFromProject(projectFromDocument(editor.getSnapshot().document!));
    const raw = await encodeAseprite(sprite);
    const compressed = await encodeAseprite(sprite, { compress: true, deflate: zlibSync });
    assert.equal(compressed.byteLength, raw.byteLength);
    const reopened = await decodeAseprite(compressed, { inflate: (bytes) => unzlibSync(bytes) });
    assert.equal(reopened.frames[0].cels[0].type, AsepriteCelType.Raw);
    assert.deepEqual([...reopened.frames[0].cels[0].pixels!], [...pixels.data]);
  });
});
