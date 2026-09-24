import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { transform } from "esbuild";
import { describe, it } from "vitest";

import {
  DEFAULT_DYNAMICS_SETTINGS,
  AsepriteDynamicSensor,
  AsepriteDynamicsColorDirection,
} from "@xprite/editor-core";

describe("dynamics-state", () => {
  it("dynamics-state behavior", async () => {
    const source = (
      await readFile(new URL("./dynamics-state.ts", import.meta.url), "utf8")
    ).replace(
      /^import \{[\s\S]*?\} from "@xprite\/editor-core";\r?\n/m,
      `const DEFAULT_DYNAMICS_SETTINGS = ${JSON.stringify(DEFAULT_DYNAMICS_SETTINGS)};\nconst AsepriteDynamicSensor = ${JSON.stringify(AsepriteDynamicSensor)};\nconst AsepriteDynamicsColorDirection = ${JSON.stringify(AsepriteDynamicsColorDirection)};\n`,
    );
    const { code } = await transform(source, { loader: "ts", format: "esm" });
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const {
      createDynamicsPreferences: create,
      getDynamicsSettings: get,
      updateDynamicsSettings: update,
      shareDynamicsSettings: share,
      setDynamicsStabilizer: stabilizer,
    } = api;
    let preferences = create();
    assert.equal(preferences.shared, true);
    assert.equal(get(preferences, "pencil").size, "static");
    const enabled = stabilizer(get(preferences, "pencil"), true);
    assert.equal(enabled.stabilizerFactor, 16);
    assert.equal(stabilizer(enabled, false).stabilizerFactor, 16);
    assert.equal(stabilizer({ ...enabled, stabilizerFactor: 32 }, true).stabilizerFactor, 32);
    preferences = share(preferences, "pencil", false);
    preferences = update(preferences, "pencil", {
      ...get(preferences, "pencil"),
      size: "pressure",
    });
    preferences = update(preferences, "eraser", {
      ...get(preferences, "eraser"),
      angle: "velocity",
    });
    const beforeSharing = preferences;
    preferences = share(preferences, "pencil", true);
    assert.equal(get(preferences, "eraser").size, "pressure");
    assert.equal(
      preferences.tools.eraser.angle,
      "velocity",
      "Shared bank must not overwrite per-tool bank",
    );
    preferences = update(preferences, "pencil", {
      ...get(preferences, "pencil"),
      gradient: "velocity",
    });
    preferences = share(preferences, "pencil", false);
    assert.equal(get(preferences, "pencil").gradient, "velocity");
    assert.equal(get(preferences, "eraser").angle, "velocity");
    assert.equal(get(preferences, "eraser").size, "static");
    assert.equal(
      beforeSharing.common.size,
      "static",
      "Preference transitions must not mutate earlier state",
    );
    assert.equal(beforeSharing.tools.pencil.gradient, "static");
    console.log(
      "12 source Dynamics preference checks passed: default sharing, stabilizer backup and independent preference banks. UI verification remains pending.",
    );
  }, 60_000);
});
