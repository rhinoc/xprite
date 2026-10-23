import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  dynamicStampAngle,
  dynamicStampSize,
  expDecay,
  mappingCalculate,
  speed1Input,
} from "$/drawing/mypaint-dynamics";

describe("libmypaint brush dynamics", () => {
  it("follows the published fine-speed anchor, log radius, and mapping extrapolation", () => {
    assert.equal(expDecay(0, 1), 0);
    assert.equal(expDecay(0.001, 1), 0);
    assert.ok(Math.abs(speed1Input(45) - 0.5) < 1e-12);
    assert.ok(speed1Input(0) < 0);
    assert.equal(
      mappingCalculate(
        0,
        [
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ],
        [2],
      ),
      2,
    );
    assert.equal(dynamicStampSize(0.5, 0, 1, 1, 9), 3);
    assert.equal(dynamicStampAngle(0.5, 0, 1, 0, 90), 45);
    assert.notEqual(dynamicStampSize(0.5, 0, 1, 1, 9), 5);
  });
});
