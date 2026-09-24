import assert from "node:assert/strict";

import { build } from "esbuild";
import { it } from "vitest";

it("shows outer docking targets in advance and keeps them distinct from local split and merge markers", async () => {
  const bundle = await build({
    entryPoints: ["apps/editor/src/managers/workspace/workspace-panel-drop-guides.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const { workspacePanelDropGuidance: guidance } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const workspace = { left: 0, top: 0, width: 800, height: 600 };
  const surfaces = [
    {
      scope: "panel",
      id: "tools",
      tabs: ["tools"],
      rect: { left: 0, top: 0, width: 34, height: 600 },
    },
    {
      scope: "canvas",
      id: "workspace-canvas",
      tabs: [],
      rect: { left: 34, top: 0, width: 566, height: 600 },
    },
    {
      scope: "panel",
      id: "palette",
      tabs: ["palette"],
      rect: { left: 600, top: 0, width: 200, height: 600 },
    },
  ];
  const request = { workspace, surfaces, sourceTabs: ["tools"] };
  const starting = guidance({ ...request, x: 20, y: 300 });
  assert.deepEqual(
    starting.guides
      .filter((guide) => guide.scope === "workspace")
      .map((guide) => guide.target.edge),
    ["left", "right", "top", "bottom"],
  );
  assert.equal(
    starting.guides.some((guide) => guide.target.paneId === "tools"),
    false,
    "The complete source pane is never offered as a merge target.",
  );
  for (const y of [80, 300, 520]) {
    const right = guidance({ ...request, x: 795, y });
    assert.deepEqual(
      right.selected.target,
      { kind: "workspace", edge: "right" },
      "The right docking band stays reachable over an existing right-hand panel.",
    );
    const marker = right.guides.find((guide) => guide.id === "workspace:right");
    assert.equal(marker.rect.left + marker.rect.width, workspace.width);
  }
  const inside = guidance({ ...request, x: 684, y: 300 });
  assert.equal(inside.selected.target.kind, "pane");
  assert.equal(inside.selected.target.edge, undefined);
  const rightSplit = inside.guides.find((guide) => guide.id === "panel:palette:right");
  const split = guidance({
    ...request,
    x: rightSplit.rect.left + rightSplit.rect.width / 2,
    y: rightSplit.rect.top + rightSplit.rect.height / 2,
  });
  assert.deepEqual(split.selected.target, { kind: "pane", paneId: "palette", edge: "right" });
  assert.ok(
    rightSplit.rect.left + rightSplit.rect.width < workspace.width - 28,
    "Panel split markers cannot overlap the outer docking band.",
  );
  assert.deepEqual(
    guidance({ ...request, x: 805, y: 200 }).selected.target,
    { kind: "workspace", edge: "right" },
    "A small excursion beyond the work area still snaps to its edge.",
  );
  assert.equal(guidance({ ...request, x: 850, y: 200 }).selected, null);
  const corner = guidance({ ...request, x: 780, y: 8, movement: { x: 760, y: 0 } });
  assert.deepEqual(
    corner.selected.target,
    { kind: "workspace", edge: "right" },
    "Dragging a vertical toolbar horizontally from its top handle must reach the right dock at the corner.",
  );
  const restricted = guidance({ ...request, sourceTabs: ["context"], x: 795, y: 200 });
  assert.equal(
    restricted.guides.some((guide) => guide.id === "workspace:right"),
    false,
  );
  const narrow = {
    scope: "panel",
    id: "narrow-bar",
    tabs: ["shortcuts"],
    rect: { left: 766, top: 0, width: 34, height: 600 },
  };
  const narrowRequest = {
    ...request,
    surfaces: [surfaces[0], { ...surfaces[1], rect: { ...surfaces[1].rect, width: 732 } }, narrow],
  };
  const approach = guidance({ ...narrowRequest, x: 780, y: 300 });
  const merge = approach.guides.find(
    (guide) => guide.target.paneId === narrow.id && !guide.target.edge,
  );
  const mergePoint = {
    x: merge.rect.left + merge.rect.width / 2,
    y: merge.rect.top + merge.rect.height / 2,
  };
  const retained = guidance({ ...narrowRequest, ...mergePoint, previousSurfaceId: narrow.id });
  assert.deepEqual(
    retained.selected.target,
    { kind: "pane", paneId: narrow.id },
    "A narrow bar's nearby merge marker remains attached to that bar while approaching it.",
  );
  const nested = guidance({
    workspace,
    surfaces: [
      {
        scope: "panel",
        id: "colors:picker",
        paneId: "colors",
        tab: "palette",
        panel: "picker",
        tabs: ["picker"],
        rect: { left: 300, top: 160, width: 200, height: 220 },
      },
    ],
    sourceTabs: ["timeline"],
    x: 400,
    y: 270,
  });
  assert.deepEqual(
    nested.guides.find((guide) => guide.scope === "panel" && guide.id.endsWith(":right")).target,
    { kind: "tab", paneId: "colors", tab: "palette", panel: "picker", edge: "right" },
    "Split markers inside a tab identify both the owning pane and the target panel.",
  );
  assert.deepEqual(
    nested.guides.find((guide) => guide.id.endsWith(":center")).target,
    { kind: "pane", paneId: "colors" },
    "The center marker still adds a sibling tab to the real pane.",
  );
});
