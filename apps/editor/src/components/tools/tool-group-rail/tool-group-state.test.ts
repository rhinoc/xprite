import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  nextToolGroupPopupPlacement,
  rememberToolChoice,
} from "$/components/tools/tool-group-rail/tool-group-state";

describe("tool group rail state", () => {
  it("keeps remembered tools by identity when the choice is unchanged", () => {
    const remembered = { Fill: "bucket" };
    assert.equal(rememberToolChoice(remembered, "Fill", "bucket"), remembered);
    const changed = rememberToolChoice(remembered, "Fill", "gradient");
    assert.notEqual(changed, remembered);
    assert.deepEqual(changed, { Fill: "gradient" });
    assert.deepEqual(remembered, { Fill: "bucket" });
  });

  it("converges when React replays the remembered-tool updater", () => {
    // React re-runs queued updaters while an earlier lower-priority update is pending.
    const committed = rememberToolChoice({}, "Fill", "bucket");
    let state = committed;
    for (let replay = 0; replay < 60; replay++) state = rememberToolChoice(state, "Fill", "bucket");
    assert.equal(state, committed);
  });

  it("keeps popup placement by identity when the measured box is unchanged", () => {
    const placement = { left: 10, top: 20, width: 60, height: 30 };
    assert.equal(nextToolGroupPopupPlacement(placement, { ...placement }), placement);
    assert.equal(nextToolGroupPopupPlacement(null, null), null);
    assert.equal(nextToolGroupPopupPlacement(placement, null), null);
    const moved = { ...placement, top: 21 };
    assert.equal(nextToolGroupPopupPlacement(placement, moved), moved);
    assert.equal(nextToolGroupPopupPlacement(null, moved), moved);
  });
});
