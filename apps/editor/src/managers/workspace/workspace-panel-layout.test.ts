import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  defaultStackedPanelNode,
  defaultDockedWorkspacePanelLayout,
  workspaceLayoutConfigurationForPreset,
  parseWorkspaceLayoutConfiguration,
  workspacePaneTabIds,
  workspaceTabPanels,
  workspacePaneTabLayout,
  workspacePaneTabSource,
  dockWorkspacePaneAtEdge,
  workspacePanelIds,
  panelPanes,
  moveWorkspacePanel,
  splitWorkspacePanel,
  splitWorkspacePane,
  dockWorkspacePanelAtCanvas,
  dockWorkspacePaneAtCanvas,
  removeWorkspacePanelPane,
  removeWorkspacePanelTab,
  resizeWorkspacePanelSplit,
  selectWorkspacePanel,
  validWorkspacePanelTree,
  validWorkspacePanelLayout,
} from "$/managers/workspace/workspace-panel-layout";

describe("workspace-panel-layout", () => {
  it("workspace-panel-layout behavior", async () => {
    for (const preset of ["compact", "wide"]) {
      const configuration = workspaceLayoutConfigurationForPreset(preset);
      assert.deepEqual(parseWorkspaceLayoutConfiguration(configuration), configuration);
      for (const field of [
        "showEditorMenuBar",
        "showShortcutToolbar",
        "showCanvasScrollbars",
        "contextBarPresentation",
      ]) {
        const incomplete = structuredClone(configuration);
        delete incomplete.chrome[field];
        assert.equal(parseWorkspaceLayoutConfiguration(incomplete), null);
      }
    }

    const tabs = (tree) => panelPanes(tree).flatMap((pane) => pane.tabs);
    const paneFor = (tree, tab) => panelPanes(tree).find((pane) => pane.tabs.includes(tab));
    const valid = (tree) => {
      assert.ok(validWorkspacePanelTree(tree));
      assert.deepEqual(
        [...tabs(tree)].sort(),
        [...workspacePanelIds].sort(),
        "Every panel stays in exactly one pane.",
      );
      return tree;
    };
    let tree = valid(defaultStackedPanelNode());
    const root = paneFor(tree, "palette").id;
    assert.equal(
      paneFor(tree, "picker").id,
      root,
      "The compact color split belongs inside the first tab.",
    );
    assert.deepEqual(workspacePaneTabIds(paneFor(tree, "palette")), [
      "palette",
      "timeline",
      "tileset",
    ]);
    assert.deepEqual(workspaceTabPanels(paneFor(tree, "palette").tabLayouts.palette), [
      "palette",
      "picker",
    ]);
    assert.deepEqual(workspacePaneTabLayout(paneFor(tree, "palette"), "timeline"), {
      kind: "panel",
      panel: "timeline",
    });
    assert.deepEqual(workspacePaneTabSource(paneFor(tree, "palette"), "palette").tabs, [
      "palette",
      "picker",
    ]);
    // Tear out the picker into a separate tab before exercising flat grouped-tab workflows.
    tree = valid(moveWorkspacePanel(tree, "picker", root, "timeline"));
    tree = valid(moveWorkspacePanel(tree, "tileset", root, "palette"));
    assert.deepEqual(paneFor(tree, "palette").tabs, ["tileset", "palette", "picker", "timeline"]);
    tree = valid(splitWorkspacePanel(tree, "timeline", root, "right"));
    assert.equal(tree.kind, "split");
    assert.equal(tree.axis, "horizontal");
    assert.deepEqual(
      panelPanes(tree).map((pane) => pane.tabs),
      [["shortcuts"], ["tools"], ["context"], ["tileset", "palette", "picker"], ["timeline"]],
    );
    const panelSplit = tree.second.second.second.second;
    assert.equal(panelSplit.axis, "horizontal");
    tree = valid(resizeWorkspacePanelSplit(tree, panelSplit.id, 0.95));
    assert.equal(tree.second.second.second.second.ratio, 0.95);
    const destination = paneFor(tree, "timeline").id;
    tree = valid(moveWorkspacePanel(tree, "picker", destination, "timeline"));
    assert.deepEqual(paneFor(tree, "timeline").tabs, ["picker", "timeline"]);
    tree = valid(selectWorkspacePanel(tree, destination, "timeline"));
    assert.equal(paneFor(tree, "timeline").active, "timeline");
    tree = valid(moveWorkspacePanel(tree, "timeline", root, "palette"));
    tree = valid(moveWorkspacePanel(tree, "picker", root));
    assert.equal(tree.kind, "split", "The canvas remains when an empty panel split collapses.");
    assert.deepEqual(paneFor(tree, "palette").tabs, ["tileset", "timeline", "palette", "picker"]);
    assert.equal(
      splitWorkspacePanel(
        { kind: "pane", id: "only", tabs: ["palette"], active: "palette" },
        "palette",
        "only",
        "left",
      ).kind,
      "pane",
    );
    assert.equal(
      validWorkspacePanelTree({
        kind: "pane",
        id: "bad",
        tabs: ["palette", "palette"],
        active: "palette",
      }),
      false,
    );
    tree = valid(dockWorkspacePanelAtCanvas(tree, "picker", "left"));
    assert.equal(
      tree.second.second.second.first.axis,
      "horizontal",
      "A tab can split beside the canvas.",
    );
    const detached = removeWorkspacePanelTab(tree, "picker");
    assert.equal(
      validWorkspacePanelLayout({
        dock: detached,
        floats: [
          {
            kind: "pane",
            id: "float-one",
            tabs: ["picker"],
            active: "picker",
            x: 10,
            y: 12,
            width: 220,
            height: 180,
          },
        ],
      }),
      true,
    );
    assert.equal(
      validWorkspacePanelLayout({ dock: detached, floats: [] }),
      false,
      "Panels cannot disappear from both dock and floats.",
    );
    assert.equal(
      validWorkspacePanelTree(JSON.parse(JSON.stringify(tree))),
      true,
      "Saved layouts remain valid after JSON roundtrip.",
    );
    const pane = paneFor(defaultStackedPanelNode(), "palette");
    const detachedPane = removeWorkspacePanelPane(defaultStackedPanelNode(), pane.id);
    assert.equal(
      panelPanes(detachedPane).some((item) => item.tabs.includes("tools")),
      true,
      "Dragging a whole tabbed pane leaves the canvas and tool rail available.",
    );
    const floatedGroup = {
      dock: detachedPane,
      floats: [{ ...pane, x: 10, y: 12, width: 220, height: 180 }],
    };
    assert.deepEqual(workspaceTabPanels(floatedGroup.floats[0].tabLayouts.palette), [
      "palette",
      "picker",
    ]);
    assert.equal(validWorkspacePanelLayout(floatedGroup), true, "All tabs can float together.");
    const foldedGroup = JSON.parse(JSON.stringify(floatedGroup));
    foldedGroup.floats[0].presentation = "button";
    assert.equal(
      validWorkspacePanelLayout(foldedGroup),
      true,
      "Button presentation persists with the full pane.",
    );
    foldedGroup.floats[0].anchor = "bottom-right";
    assert.equal(validWorkspacePanelLayout(JSON.parse(JSON.stringify(foldedGroup))), true);
    foldedGroup.floats[0].anchor = "invalid";
    assert.equal(validWorkspacePanelLayout(foldedGroup), false);
    delete foldedGroup.floats[0].anchor;
    foldedGroup.floats[0].presentation = "invalid";
    assert.equal(validWorkspacePanelLayout(foldedGroup), false);
    assert.equal(
      validWorkspacePanelTree(dockWorkspacePaneAtCanvas(detachedPane, pane, "left")),
      true,
      "The full pane can dock beside the canvas.",
    );
    const grouped = splitWorkspacePanel(defaultStackedPanelNode(), "timeline", pane.id, "right");
    const second = paneFor(grouped, "timeline");
    const movedGroup = splitWorkspacePane(grouped, second, pane.id, "top");
    assert.equal(
      validWorkspacePanelTree(movedGroup),
      true,
      "A complete pane can move to a different split edge.",
    );
    // Every previously fixed compact bar can float and return without disappearing on reload.
    const compact = defaultStackedPanelNode();
    for (const id of ["tools", "context", "shortcuts"]) {
      const bar = paneFor(compact, id);
      const floating = {
        dock: removeWorkspacePanelPane(compact, bar.id),
        floats: [
          {
            ...bar,
            x: 12,
            y: 12,
            width: id === "context" ? 300 : 32,
            height: id === "context" ? 32 : 300,
          },
        ],
      };
      assert.equal(validWorkspacePanelLayout(JSON.parse(JSON.stringify(floating))), true);
      valid(dockWorkspacePaneAtEdge(floating.dock, bar, id === "context" ? "top" : "right"));
      if (id === "context")
        assert.equal(dockWorkspacePaneAtEdge(floating.dock, bar, "left"), floating.dock);
    }
    for (const missing of [["shortcuts"], ["tools", "context", "shortcuts"]]) {
      let incomplete = compact;
      for (const id of missing) incomplete = removeWorkspacePanelTab(incomplete, id);
      assert.equal(
        validWorkspacePanelLayout({ dock: incomplete, floats: [] }),
        false,
        "Saved layouts must include every current panel.",
      );
    }
    assert.equal(
      validWorkspacePanelLayout(defaultDockedWorkspacePanelLayout()),
      true,
      "Wide layouts include the same movable shortcut rail.",
    );
    console.log(
      "Compact and wide layouts share tab reorder, canvas split, float transfer, resize, merge and persistence invariants.",
    );
  }, 60_000);
});
