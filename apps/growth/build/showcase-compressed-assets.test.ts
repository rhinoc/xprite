import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { describe, it } from "vitest";

const ASSET_DIRECTORY = fileURLToPath(new URL("../public/showcase/ipad/", import.meta.url));
const MANIFEST = fileURLToPath(
  new URL("../src/adapters/showcase/compressed-assets.json", import.meta.url),
);
const compressedAssets = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  files: Record<string, { bytes: number; gzipBytes: number; sha256: string }>;
};
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("compressed showcase assets", () => {
  it("inflate to the current original files", () => {
    for (const [file, entry] of Object.entries(compressedAssets.files)) {
      const original = readFileSync(`${ASSET_DIRECTORY}${file}`);
      const inflated = gunzipSync(readFileSync(`${ASSET_DIRECTORY}${file}.gz`));
      const regenerate = "run node scripts/showcase/compress-assets.mjs";
      assert.equal(sha256(original), entry.sha256, `${file} changed; ${regenerate}`);
      assert.equal(sha256(inflated), entry.sha256, `${file}.gz is stale; ${regenerate}`);
      assert.ok(entry.gzipBytes < entry.bytes, `${file}.gz is not smaller`);
    }
  });
});
