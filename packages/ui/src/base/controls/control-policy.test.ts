import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("entry-selection", () => {
  it("entry-selection behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/ui/src/base/controls/control-policy.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { entrySelection } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
    );
    assert.deepEqual(entrySelection("64", 0, 2), {
      before: "",
      selected: "64",
      after: "",
      from: 0,
      to: 2,
    });
    assert.deepEqual(entrySelection("abcdef", 4, 1), {
      before: "a",
      selected: "bcd",
      after: "ef",
      from: 1,
      to: 4,
    });
    assert.deepEqual(entrySelection("12", -20, 100), {
      before: "",
      selected: "12",
      after: "",
      from: 0,
      to: 2,
    });
    assert.equal(entrySelection("12", null, null).selected, "");
    assert.equal(entrySelection("12", NaN, Infinity).selected, "");
    assert.equal(entrySelection("a😀b", 1, 3).selected, "😀");
    console.log("Input selection: full/reverse/bounded/absent/nonfinite/UTF16 ranges pass.");
  }, 60_000);
});
