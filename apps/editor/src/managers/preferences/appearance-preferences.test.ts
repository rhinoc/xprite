import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("appearance-preferences", () => {
  it("appearance-preferences behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["apps/editor/src/managers/preferences/appearance-preferences.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { beginAppearancePreferences: begin, updateAppearancePreferences: step } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    for (const opening of ["light", "dark"]) {
      const other = opening === "light" ? "dark" : "light";
      const original = begin(opening);
      let state = step(original, { type: "preview", mode: other });
      assert.equal(original.current, opening);
      assert.equal(state.current, other);
      assert.equal(state.committed, opening);
      let canceled = step(state, { type: "cancel" });
      assert.equal(canceled.current, opening);
      assert.equal(canceled.open, false);
      assert.equal(step(canceled, { type: "preview", mode: other }), canceled);
      let accepted = step(state, { type: "accept" });
      assert.equal(accepted.current, other);
      assert.equal(accepted.committed, other);
      assert.equal(accepted.open, false);
      state = step(state, { type: "apply" });
      assert.equal(state.open, true);
      assert.equal(state.committed, other);
      state = step(state, { type: "preview", mode: opening });
      state = step(state, { type: "cancel" });
      assert.equal(state.current, other);
      assert.equal(begin(state.current).committed, other);
    }
    console.log(
      "Appearance preferences: preview/cancel/accept/apply checkpoint, immutable state, closed-session guards and reopening pass in both modes.",
    );
  }, 60_000);
});
