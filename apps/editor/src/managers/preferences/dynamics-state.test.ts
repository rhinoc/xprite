import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { transform } from "esbuild";
import { describe, it } from "vitest";

import {
  DEFAULT_DYNAMICS_SETTINGS,
  MYPAINT_PRESSURE_GAIN_LOG_LIMIT,
  MYPAINT_SLOW_TRACKING_MAX,
} from "@xprite/editor-core";

describe("dynamics-state", () => {
  it("dynamics-state behavior", async () => {
    const source = (
      await readFile(new URL("./dynamics-state.ts", import.meta.url), "utf8")
    ).replace(
      /^import \{[\s\S]*?\} from "@xprite\/editor-core";\r?\n/m,
      `const DEFAULT_DYNAMICS_SETTINGS = ${JSON.stringify(DEFAULT_DYNAMICS_SETTINGS)};\nconst MYPAINT_PRESSURE_GAIN_LOG_LIMIT = ${MYPAINT_PRESSURE_GAIN_LOG_LIMIT};\nconst MYPAINT_SLOW_TRACKING_MAX = ${MYPAINT_SLOW_TRACKING_MAX};\n`,
    );
    const { code } = await transform(source, { loader: "ts", format: "esm" });
    const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const {
      createDynamicsPreferences: create,
      getDynamicsSettings: get,
      updateDynamicsSettings: update,
      shareDynamicsSettings: share,
      SLOW_TRACKING_SLIDER_MAX,
      PRESSURE_GAIN_SLIDER_LIMIT,
      slowTrackingSliderValue,
      withSlowTrackingSliderValue,
      slowTrackingLabel,
      pressureGainSliderValue,
      withPressureGainSliderValue,
      pressureGainLabel,
    } = api;
    let preferences = create();
    assert.equal(preferences.shared, true);
    assert.equal(get(preferences, "pencil").sizeInput, "none");
    assert.equal(get(preferences, "pencil").slowTracking, 0);
    assert.equal(get(preferences, "pencil").pressureGain, 0);

    assert.equal(SLOW_TRACKING_SLIDER_MAX, 100);
    assert.equal(PRESSURE_GAIN_SLIDER_LIMIT, 18);
    const tracked = withSlowTrackingSliderValue(get(preferences, "pencil"), 25);
    assert.equal(tracked.slowTracking, 2.5);
    assert.equal(slowTrackingSliderValue(tracked), 25);
    assert.equal(slowTrackingLabel(25), "2.5");
    const gained = withPressureGainSliderValue(get(preferences, "pencil"), -18);
    assert.equal(gained.pressureGain, -1.8);
    assert.equal(pressureGainSliderValue(gained), -18);
    assert.equal(pressureGainLabel(0), "1.00x");
    assert.equal(pressureGainLabel(10), "2.72x");

    preferences = share(preferences, "pencil", false);
    preferences = update(preferences, "pencil", {
      ...get(preferences, "pencil"),
      sizeInput: "pressure",
    });
    preferences = update(preferences, "eraser", {
      ...get(preferences, "eraser"),
      angleInput: "speed",
    });
    const beforeSharing = preferences;
    preferences = share(preferences, "pencil", true);
    assert.equal(get(preferences, "eraser").sizeInput, "pressure");
    assert.equal(
      preferences.tools.eraser.angleInput,
      "speed",
      "Shared bank must not overwrite per-tool bank",
    );
    preferences = update(preferences, "pencil", {
      ...get(preferences, "pencil"),
      colorInput: "speed",
    });
    preferences = share(preferences, "pencil", false);
    assert.equal(get(preferences, "pencil").colorInput, "speed");
    assert.equal(get(preferences, "eraser").angleInput, "speed");
    assert.equal(get(preferences, "eraser").sizeInput, "none");
    assert.equal(
      beforeSharing.common.sizeInput,
      "none",
      "Preference transitions must not mutate earlier state",
    );
    assert.equal(beforeSharing.tools.pencil.colorInput, "none");
    console.log(
      "Dynamics preference checks passed: default sharing, slider mappings and independent preference banks.",
    );
  }, 60_000);
});
