import assert from "node:assert/strict";

import { build } from "esbuild";
import { it } from "vitest";

it("floating panels keep their launcher anchor across opening, moving and resizing", async () => {
  const bundle = await build({
    entryPoints: ["apps/editor/src/managers/workspace/workspace-panel-geometry.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const {
    floatingWorkspaceAnchorOffset,
    floatingWorkspaceRect,
    floatingWorkspaceResizeEdges,
    resizeFloatingWorkspaceGeometry,
    toggleFloatingWorkspacePane,
  } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const area = { width: 1024, height: 800 };
  const thickness = 34;
  const launcher = (x, y, width = 320, height = 360) => ({
    kind: "pane",
    id: "floating-picker",
    tabs: ["picker"],
    active: "picker",
    presentation: "button",
    x,
    y,
    width,
    height,
  });
  const cases = [
    [20, 20, 320, 360, "top-left"],
    [970, 20, 320, 360, "top-right"],
    [20, 746, 320, 360, "bottom-left"],
    [970, 746, 320, 360, "bottom-right"],
    [495, 20, 900, 360, "top"],
    [495, 746, 900, 360, "bottom"],
    [20, 380, 320, 700, "left"],
    [970, 380, 320, 700, "right"],
  ];
  for (const [x, y, width, height, anchor] of cases) {
    const opened = toggleFloatingWorkspacePane(launcher(x, y, width, height), area, thickness);
    assert.equal(opened.anchor, anchor);
    assert.equal(opened.width, width, "Opening in an available direction retains the width.");
    assert.equal(opened.height, height, "Opening in an available direction retains the height.");
    const offset = floatingWorkspaceAnchorOffset(opened, thickness);
    assert.equal(opened.x + offset.x, x, "The expanded icon stays at the launcher X position.");
    assert.equal(opened.y + offset.y, y, "The expanded icon stays at the launcher Y position.");
    assert.ok(opened.x >= 0 && opened.y >= 0);
    assert.ok(opened.x + width <= area.width && opened.y + height <= area.height);
    const closed = toggleFloatingWorkspacePane(opened, area, thickness);
    assert.equal(closed.x, x);
    assert.equal(closed.y, y);
    assert.equal(closed.presentation, "button");
  }

  const opened = toggleFloatingWorkspacePane(launcher(970, 746), area, thickness);
  assert.deepEqual(floatingWorkspaceResizeEdges(opened), { x: "left", y: "top" });
  const enlarged = resizeFloatingWorkspaceGeometry(opened, area, thickness, { x: -40, y: -30 });
  assert.deepEqual(enlarged, { x: 644, y: 390, width: 360, height: 390 });
  const resizedPane = { ...opened, ...enlarged };
  const folded = toggleFloatingWorkspacePane(resizedPane, area, thickness);
  assert.equal(folded.x, 970);
  assert.equal(folded.y, 746);
  assert.equal(
    resizedPane.anchor,
    "bottom-right",
    "Resizing never reselects an opening direction.",
  );

  const moved = { ...opened, x: opened.x - 100, y: opened.y - 50 };
  assert.deepEqual(floatingWorkspaceRect(moved, area, thickness), {
    x: 584,
    y: 370,
    width: 320,
    height: 360,
  });
  assert.equal(moved.anchor, "bottom-right");

  const minimum = resizeFloatingWorkspaceGeometry(opened, area, thickness, { x: 9999, y: 9999 });
  assert.deepEqual(minimum, { x: 884, y: 680, width: 120, height: 100 });
  const maximum = resizeFloatingWorkspaceGeometry(opened, area, thickness, { x: -9999, y: -9999 });
  assert.deepEqual(maximum, { x: 0, y: 0, width: 1004, height: 780 });

  const centered = toggleFloatingWorkspacePane(launcher(495, 20, 900, 360), area, thickness);
  const wider = {
    ...centered,
    ...resizeFloatingWorkspaceGeometry(centered, area, thickness, { x: 20, y: 0 }),
  };
  assert.equal(wider.width, 940);
  const centeredOffset = floatingWorkspaceAnchorOffset(wider, thickness);
  assert.equal(wider.x + centeredOffset.x, 495, "Centered expansion resizes around the same icon.");

  const legacy = { ...launcher(100, 100), presentation: "window" };
  assert.deepEqual(resizeFloatingWorkspaceGeometry(legacy, area, thickness, { x: 40, y: 30 }), {
    x: 100,
    y: 100,
    width: 360,
    height: 390,
  });
  const shortArea = { width: 360, height: 100 };
  const shortWindow = toggleFloatingWorkspacePane(launcher(164, 33), shortArea, thickness);
  const unchanged = resizeFloatingWorkspaceGeometry(shortWindow, shortArea, thickness, {
    x: 0,
    y: 0,
  });
  assert.equal(unchanged.width, shortWindow.width);
  assert.equal(
    unchanged.height,
    shortWindow.height,
    "Starting a resize must not shrink a minimum-size window.",
  );
});
