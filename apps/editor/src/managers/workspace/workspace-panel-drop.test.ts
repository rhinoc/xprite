import assert from "node:assert/strict";

import { build } from "esbuild";
import { it } from "vitest";

it("moves a lower pane to its neighbour's right, merges centrally and tears out one floating tab", async () => {
  const bundle = await build({
    stdin: {
      contents:
        'export * from "./apps/editor/src/managers/workspace/workspace-panel-drop.ts"; export * from "./apps/editor/src/managers/workspace/workspace-panel-layout.ts";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const {
    transferWorkspacePanels,
    workspacePanelDropEdge,
    workspacePaneTabIds,
    workspacePaneTabLayout,
    workspacePaneTabSource,
    workspaceTabPanels,
    resizeWorkspacePaneTabSplit,
    validWorkspacePanelLayout,
  } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const a = { kind: "pane", id: "a", tabs: ["palette"], active: "palette" };
  const b = { kind: "pane", id: "b", tabs: ["picker"], active: "picker" };
  const floating = (pane) => ({ ...pane, x: 100, y: 100, width: 240, height: 180 });
  const layout = {
    dock: {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.6,
      first: { kind: "canvas", id: "workspace-canvas" },
      second: { kind: "split", id: "stack", axis: "vertical", ratio: 0.5, first: a, second: b },
    },
    floats: [
      floating({
        kind: "pane",
        id: "animation",
        tabs: ["timeline", "tileset"],
        active: "timeline",
      }),
    ],
  };
  const original = JSON.stringify(layout);
  const split = transferWorkspacePanels(
    layout,
    b,
    { kind: "pane", paneId: "a", edge: "right" },
    floating(b),
  );
  assert.equal(split.dock.first, layout.dock.first);
  assert.equal(split.dock.second.axis, "horizontal");
  assert.deepEqual(split.dock.second.first.tabs, ["palette"]);
  assert.deepEqual(split.dock.second.second.tabs, ["picker"]);
  assert.equal(
    JSON.stringify(layout),
    original,
    "Previewing a transfer must not mutate the live layout.",
  );
  const merged = transferWorkspacePanels(layout, b, { kind: "pane", paneId: "a" }, floating(b));
  assert.deepEqual(merged.dock.second.tabs, ["palette", "picker"]);
  assert.equal(merged.dock.second.active, "picker");
  const torn = transferWorkspacePanels(
    layout,
    { kind: "pane", id: "detached", tabs: ["timeline"], active: "timeline" },
    { kind: "outside" },
    floating({ kind: "pane", id: "detached", tabs: ["timeline"], active: "timeline" }),
  );
  assert.deepEqual(torn.floats[0].tabs, ["tileset"]);
  assert.equal(torn.floats[0].active, "tileset");
  assert.deepEqual(torn.floats[1].tabs, ["timeline"]);
  const samePaneSplit = transferWorkspacePanels(
    merged,
    { kind: "pane", id: "a", tabs: ["picker"], active: "picker" },
    { kind: "pane", paneId: "a", edge: "right" },
    floating(b),
  );
  assert.deepEqual(samePaneSplit.dock.second.first.tabs, ["palette"]);
  assert.deepEqual(samePaneSplit.dock.second.second.tabs, ["picker"]);
  assert.notEqual(samePaneSplit.dock.second.first.id, samePaneSplit.dock.second.second.id);
  const invalid = transferWorkspacePanels(
    layout,
    { kind: "pane", id: "context", tabs: ["context"], active: "context" },
    { kind: "pane", paneId: "a", edge: "right" },
    floating(b),
  );
  assert.equal(invalid, layout, "An unsupported edge must leave the source untouched.");
  assert.equal(
    transferWorkspacePanels(layout, b, { kind: "pane", paneId: "missing" }, floating(b)),
    layout,
  );
  const rect = { left: 100, top: 100, width: 400, height: 200 };
  assert.equal(workspacePanelDropEdge(rect, 300, 200), undefined);
  assert.equal(workspacePanelDropEdge(rect, 450, 200), "right");
  assert.equal(workspacePanelDropEdge(rect, 300, 125), "top");
  assert.equal(
    workspacePanelDropEdge({ left: 0, top: 0, width: 32, height: 300 }, 16, 150),
    undefined,
  );
  const tools = { kind: "pane", id: "tools", tabs: ["tools"], active: "tools" };
  const inactiveTabLayout = { ...layout, floats: [{ ...layout.floats[0], active: "tileset" }] };
  const beforePairing = JSON.stringify(inactiveTabLayout);
  const paired = transferWorkspacePanels(
    inactiveTabLayout,
    b,
    { kind: "tab", paneId: "animation", tab: "timeline", edge: "right" },
    floating(b),
  );
  const pairedPane = paired.floats[0];
  assert.equal(pairedPane.active, "timeline", "Dropping on an inactive tab selects that tab.");
  assert.deepEqual(workspacePaneTabIds(pairedPane), ["timeline", "tileset"]);
  assert.deepEqual(workspaceTabPanels(workspacePaneTabLayout(pairedPane, "timeline")), [
    "timeline",
    "picker",
  ]);
  assert.deepEqual(
    workspacePaneTabLayout(pairedPane, "tileset"),
    { kind: "panel", panel: "tileset" },
    "The sibling tab keeps its own contents.",
  );
  assert.equal(validWorkspacePanelLayout(paired), true);
  assert.equal(
    JSON.stringify(inactiveTabLayout),
    beforePairing,
    "A tab split preview leaves the source layout untouched.",
  );
  const resizedPair = resizeWorkspacePaneTabSplit(
    pairedPane,
    pairedPane.tabLayouts.timeline.id,
    0.65,
  );
  assert.equal(resizedPair.tabLayouts.timeline.ratio, 0.65);
  assert.equal(resizedPair.width, pairedPane.width);
  const compound = workspacePaneTabSource(pairedPane, "timeline");
  const detachedPair = transferWorkspacePanels(
    paired,
    compound,
    { kind: "outside" },
    floating(compound),
  );
  assert.deepEqual(detachedPair.floats[0].tabs, ["tileset"]);
  assert.deepEqual(workspacePaneTabIds(detachedPair.floats[1]), ["timeline"]);
  assert.deepEqual(workspaceTabPanels(detachedPair.floats[1].tabLayouts.timeline), [
    "timeline",
    "picker",
  ]);
  assert.equal(validWorkspacePanelLayout(JSON.parse(JSON.stringify(detachedPair))), true);
  const detachedPicker = transferWorkspacePanels(
    paired,
    { kind: "pane", id: "picker-alone", tabs: ["picker"], active: "picker" },
    { kind: "outside" },
    floating(b),
  );
  assert.deepEqual(workspacePaneTabIds(detachedPicker.floats[0]), ["timeline", "tileset"]);
  assert.deepEqual(workspacePaneTabLayout(detachedPicker.floats[0], "timeline"), {
    kind: "panel",
    panel: "timeline",
  });
  assert.equal(validWorkspacePanelLayout(detachedPicker), true);
  const invalidPair = JSON.parse(JSON.stringify(paired));
  invalidPair.floats[0].tabLayouts.timeline.second.panel = "palette";
  assert.equal(
    validWorkspacePanelLayout(invalidPair),
    false,
    "A tab layout cannot contain a panel owned by another pane.",
  );
  const withLeftTools = {
    ...layout,
    dock: {
      kind: "split",
      id: "tool-split",
      axis: "horizontal",
      ratio: 0.04,
      first: tools,
      second: layout.dock,
    },
  };
  const rightTools = transferWorkspacePanels(
    withLeftTools,
    tools,
    { kind: "workspace", edge: "right" },
    floating(tools),
    0.04,
  );
  assert.equal(rightTools.dock.axis, "horizontal");
  assert.deepEqual(rightTools.dock.second.tabs, ["tools"]);
  assert.deepEqual(
    rightTools.dock.first,
    layout.dock,
    "Moving a left-hand toolbar to the far right preserves the entire remaining work area.",
  );
  assert.equal(
    rightTools.floats.some((pane) => pane.tabs.includes("tools")),
    false,
  );
});
