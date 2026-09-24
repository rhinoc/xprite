import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { PixelPerfectPath, usesCornerThinning } from "$/canvas/raster/pixel-perfect";

describe("pixel-perfect", () => {
  it("pixel-perfect behavior", async () => {
    const point = (x, y) => ({ x, y });
    const pointKey = ({ x, y }) => `${x}:${y}`;

    // Stationary input paints once, while incremental collinear input emits only
    // the newly reached centers and stores an independent path snapshot.
    const straight = new PixelPerfectPath();
    assert.deepEqual(straight.join([point(0, 0)]), [{ kind: "paint", point: point(0, 0) }]);
    assert.deepEqual(
      straight.join([point(0, 0), point(3, 0)]).map(({ kind, point: p }) => [kind, pointKey(p)]),
      [
        ["paint", "1:0"],
        ["paint", "2:0"],
        ["save", "3:0"],
        ["paint", "3:0"],
      ],
    );
    const snapshot = straight.getPoints();
    snapshot[0].x = 99;
    assert.deepEqual(straight.getPoints()[0], point(0, 0));

    // A right-angle center is rolled back after the following center confirms the
    // turn; the diagonal path then continues from the retained centers.
    const corner = new PixelPerfectPath();
    corner.join([point(0, 0)]);
    corner.join([point(0, 0), point(1, 0)]);
    assert.deepEqual(corner.join([point(1, 0), point(1, 1)]), [
      { kind: "restore", point: point(1, 0) },
      { kind: "save", point: point(1, 1) },
      { kind: "paint", point: point(1, 1) },
    ]);
    assert.deepEqual(corner.getPoints(), [point(0, 0), point(1, 1)]);

    // A fresh preview trace excludes its anchor. A closed segment is ignored so
    // it cannot duplicate an existing path or overwrite a stamp.
    const preview = new PixelPerfectPath();
    assert.deepEqual(preview.join([point(0, 0), point(3, 0)], "last"), [
      { kind: "paint", point: point(1, 0) },
      { kind: "paint", point: point(2, 0) },
      { kind: "paint", point: point(3, 0) },
    ]);
    assert.deepEqual(preview.join([point(3, 0), point(0, 0), point(3, 0)]), []);
    assert.deepEqual(preview.join([]), []);

    // Static line brushes are checked against their actual footprint. Dynamic line
    // brush angles keep the centerline intact because their footprint changes.
    assert.equal(usesCornerThinning({ shape: "line" }, false), false);
    assert.equal(usesCornerThinning({ shape: "line" }, true), true);
    const narrowLine = new PixelPerfectPath(),
      narrowBrush = { shape: "line", size: 1, angle: 0 };
    narrowLine.join([point(0, 0)], "accumulate", { brush: narrowBrush });
    narrowLine.join([point(0, 0), point(1, 0)], "accumulate", { brush: narrowBrush });
    assert.deepEqual(
      narrowLine.join([point(1, 0), point(1, 1)], "accumulate", { brush: narrowBrush }),
      [
        { kind: "restore", point: point(1, 0) },
        { kind: "save", point: point(1, 1) },
        { kind: "paint", point: point(1, 1) },
      ],
    );
    const dynamicLine = new PixelPerfectPath();
    dynamicLine.join([point(0, 0)], "accumulate", {
      brush: { shape: "line", size: 7, angle: 45 },
      brushAngleStatic: false,
    });
    dynamicLine.join([point(0, 0), point(1, 0)], "accumulate", {
      brush: { shape: "line", size: 7, angle: 45 },
      brushAngleStatic: false,
    });
    assert.equal(
      dynamicLine
        .join([point(1, 0), point(1, 1)], "accumulate", {
          brush: { shape: "line", size: 7, angle: 45 },
          brushAngleStatic: false,
        })
        .some((operation) => operation.kind === "restore"),
      false,
    );

    // Long generated traces preserve operation ordering and never expose adjacent
    // duplicate centers. Rollbacks must match an earlier saved stamp exactly.
    let seed = 81;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let trial = 0; trial < 120; trial++) {
      const path = new PixelPerfectPath();
      const saved = new Set();
      let previous = point(0, 0);
      path.join([previous]);
      for (let i = 0; i < 80; i++) {
        const next = point(previous.x + (random() % 9) - 4, previous.y + (random() % 9) - 4);
        const operations = path.join([previous, next]);
        for (let at = 0; at < operations.length; at++) {
          const operation = operations[at],
            key = pointKey(operation.point);
          assert.ok(Number.isInteger(operation.point.x) && Number.isInteger(operation.point.y));
          if (operation.kind === "save") {
            assert.equal(operations[at + 1]?.kind, "paint");
            assert.equal(pointKey(operations[at + 1].point), key);
            saved.add(key);
          } else if (operation.kind === "restore") {
            assert.ok(saved.has(key), `rollback must refer to a saved center (${key})`);
            saved.delete(key);
          }
        }
        const centers = path.getPoints();
        for (let c = 1; c < centers.length; c++) assert.notDeepEqual(centers[c], centers[c - 1]);
        previous = next;
      }
    }

    console.log(
      "Pixel-perfect path behavior passes independent corner, preview, brush-footprint, and 9,600-step path checks.",
    );
  }, 60_000);
});
