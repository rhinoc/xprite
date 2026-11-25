import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

import { SLOW_TRACKING_ENABLED_AMOUNT, SLOW_TRACKING_MAX } from "@xprite/editor-core";

describe("dynamics-state", () => {
  it("dynamics-state behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["apps/editor/src/managers/preferences/dynamics-state.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      createDynamicsPreferences: create,
      getDynamicsSettings: get,
      updateDynamicsSettings: update,
      shareDynamicsSettings: share,
      setSlowTracking: track,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    let preferences = create();
    assert.equal(preferences.shared, true);
    assert.equal(get(preferences, "pencil").size, "off");
    const enabled = track(get(preferences, "pencil"), true);
    assert.equal(enabled.slowTracking, true);
    assert.equal(enabled.slowTrackingAmount, SLOW_TRACKING_ENABLED_AMOUNT);
    assert.equal(track(enabled, false).slowTrackingAmount, SLOW_TRACKING_ENABLED_AMOUNT);
    assert.equal(track({ ...enabled, slowTrackingAmount: 5 }, true).slowTrackingAmount, 5);
    assert.equal(SLOW_TRACKING_MAX, 10);
    preferences = share(preferences, "pencil", false);
    preferences = update(preferences, "pencil", {
      ...get(preferences, "pencil"),
      size: "pressure",
    });
    preferences = update(preferences, "eraser", {
      ...get(preferences, "eraser"),
      angle: "speed",
    });
    const beforeSharing = preferences;
    preferences = share(preferences, "pencil", true);
    assert.equal(get(preferences, "eraser").size, "pressure");
    assert.equal(
      preferences.tools.eraser.angle,
      "speed",
      "Shared bank must not overwrite per-tool bank",
    );
    preferences = update(preferences, "pencil", {
      ...get(preferences, "pencil"),
      color: "speed",
    });
    preferences = share(preferences, "pencil", false);
    assert.equal(get(preferences, "pencil").color, "speed");
    assert.equal(get(preferences, "eraser").angle, "speed");
    assert.equal(get(preferences, "eraser").size, "off");
    assert.equal(
      beforeSharing.common.size,
      "off",
      "Preference transitions must not mutate earlier state",
    );
    assert.equal(beforeSharing.tools.pencil.color, "off");
  }, 60_000);
});
