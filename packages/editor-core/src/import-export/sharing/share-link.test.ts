import assert from "node:assert/strict";

import { deflateSync, inflateSync } from "fflate";
import { describe, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { encodeAsepriteSync, projectFromDocument } from "$/import-export/aseprite";
import {
  SHARE_FRAGMENT_PREFIX,
  decodeSharedProject,
  encodeSharedProject,
  type ShareCompressionCodec,
  type ShareLinkLimits,
} from "$/import-export/sharing/share-link";
import { shareProjectFromProject } from "$/import-export/sharing/share-project";

const WIDTH = 4;
const HEIGHT = 4;
const BASE_URL = "https://xprite.cc/editor";
const LIMITS: ShareLinkLimits = { maxProjectBytes: 1024 * 1024, maxUrlCharacters: 8192 };
const compression: ShareCompressionCodec = {
  compress: async (bytes) => new Uint8Array([1, ...deflateSync(bytes)]),
  refine: async (_bytes, best) => best,
  decompress: async (bytes, maxBytes) => {
    assert.equal(bytes[0], 1);
    const result = inflateSync(bytes.subarray(1));
    assert.ok(result.length <= maxBytes);
    return result;
  },
};

function source() {
  const editor = new RasterEditor({
    width: WIDTH,
    height: HEIGHT,
    data: Uint8ClampedArray.from({ length: WIDTH * HEIGHT * 4 }, (_, index) => index),
  });
  return shareProjectFromProject(
    projectFromDocument(editor.getSnapshot().document!),
    "中文🎨.aseprite",
    0,
    false,
  );
}

describe("platform independent share link pipeline", () => {
  it("round-trips the exact editable file bytes, name and hidden RGB through injected compression", async () => {
    const original = source();
    const expected = encodeAsepriteSync(original.sprite);
    const result = await encodeSharedProject(original, BASE_URL, LIMITS, compression);
    assert.ok(result.url);
    assert.equal(result.url.length, result.urlCharacters);
    assert.equal(result.frameCount, 1);
    assert.equal(result.layerCount, 1);
    const restored = await decodeSharedProject(
      result.url.slice(BASE_URL.length + SHARE_FRAGMENT_PREFIX.length),
      LIMITS,
      compression,
    );
    assert.equal(restored.name, original.name);
    assert.deepEqual(restored.bytes, expected);
  });

  it("reports rejected URL length and document counts without publishing a partial link", async () => {
    const result = await encodeSharedProject(
      source(),
      BASE_URL,
      { ...LIMITS, maxUrlCharacters: 1 },
      compression,
    );
    assert.equal(result.url, null);
    assert.equal(result.qr, null);
    assert.ok(result.urlCharacters > 1);
    assert.equal(result.frameCount, 1);
    assert.equal(result.layerCount, 1);
  });

  it("rejects invalid or oversized text before invoking a compression runtime", async () => {
    let called = false;
    const codec = {
      ...compression,
      decompress: async () => {
        called = true;
        return new Uint8Array();
      },
    };
    await assert.rejects(decodeSharedProject("?invalid", LIMITS, codec), /Invalid share data/);
    await assert.rejects(
      decodeSharedProject("U".repeat(LIMITS.maxUrlCharacters + 1), LIMITS, codec),
      /too long/,
    );
    assert.equal(called, false);
  });
});
