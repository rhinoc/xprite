import { tUi, type UiMessageKey } from "$/i18n";
import { DockEdge } from "$/managers/workspace/dock-edge";
import type { WorkspacePanelDrop } from "$/managers/workspace/workspace-panel-drop";
import {
  type WorkspaceDropGuide,
  type WorkspaceDropGuidance,
} from "$/managers/workspace/workspace-panel-drop-guides";
import { Text, TextVariant } from "@xprite/ui";

import styles from "$/components/workspace/workspace-drop-guides/workspace-drop-guides.module.css";

const GUIDE_HINT_TOP = 36;
const GUIDE_HINT_MARGIN = 32;
const GUIDE_HINT_CLEARANCE_HEIGHT = 40;
const GUIDE_LABEL_SCALE = 1.4;
const GUIDE_HINT_SCALE = 1.4;

const outerLabels: Record<DockEdge, UiMessageKey> = {
  [DockEdge.Left]: "ui.workspace.drop.guide.outer.left",
  [DockEdge.Right]: "ui.workspace.drop.guide.outer.right",
  [DockEdge.Top]: "ui.workspace.drop.guide.outer.top",
  [DockEdge.Bottom]: "ui.workspace.drop.guide.outer.bottom",
};
const splitLabels: Record<DockEdge, UiMessageKey> = {
  [DockEdge.Left]: "ui.workspace.drop.guide.split.left",
  [DockEdge.Right]: "ui.workspace.drop.guide.split.right",
  [DockEdge.Top]: "ui.workspace.drop.guide.split.top",
  [DockEdge.Bottom]: "ui.workspace.drop.guide.split.bottom",
};
const dockDescriptions: Record<DockEdge, UiMessageKey> = {
  [DockEdge.Left]: "ui.workspace.drop.dock.left",
  [DockEdge.Right]: "ui.workspace.drop.dock.right",
  [DockEdge.Top]: "ui.workspace.drop.dock.top",
  [DockEdge.Bottom]: "ui.workspace.drop.dock.bottom",
};
const splitDescriptions: Record<DockEdge, UiMessageKey> = {
  [DockEdge.Left]: "ui.workspace.drop.split.left",
  [DockEdge.Right]: "ui.workspace.drop.split.right",
  [DockEdge.Top]: "ui.workspace.drop.split.top",
  [DockEdge.Bottom]: "ui.workspace.drop.split.bottom",
};
const canvasDescriptions: Record<DockEdge, UiMessageKey> = {
  [DockEdge.Left]: "ui.workspace.drop.canvas.left",
  [DockEdge.Right]: "ui.workspace.drop.canvas.right",
  [DockEdge.Top]: "ui.workspace.drop.canvas.top",
  [DockEdge.Bottom]: "ui.workspace.drop.canvas.bottom",
};

export function workspaceDropTargetLabel(target: WorkspacePanelDrop): string {
  if (target.kind === "workspace") return tUi(dockDescriptions[target.edge]);
  if (target.kind === "tab") return tUi(splitDescriptions[target.edge]);
  if (target.kind === "canvas" && target.edge) return tUi(canvasDescriptions[target.edge]);
  if (target.kind === "pane" && target.edge) return tUi(splitDescriptions[target.edge]);
  return target.kind === "pane" || target.kind === "float"
    ? tUi("ui.merge.as.tabs")
    : tUi("ui.float.panel");
}

function guideLabel(guide: WorkspaceDropGuide): string {
  if (guide.target.kind === "workspace") return tUi(outerLabels[guide.target.edge]);
  if ("edge" in guide.target && guide.target.edge) return tUi(splitLabels[guide.target.edge]);
  return guide.target.kind === "outside" ? tUi("ui.workspace.drop.guide.float") : "+";
}

/** Paint exactly the rectangles used by the manager; pointer capture remains with the dragged item. */
export function WorkspaceDropGuides({ guidance }: { guidance: WorkspaceDropGuidance }) {
  const hintRect = {
    left: guidance.workspace.left + GUIDE_HINT_MARGIN,
    top: guidance.workspace.top + GUIDE_HINT_TOP,
    width: Math.max(0, guidance.workspace.width - GUIDE_HINT_MARGIN * 2),
    height: GUIDE_HINT_CLEARANCE_HEIGHT,
  };
  const hintClear =
    guidance.workspace.height > GUIDE_HINT_TOP + GUIDE_HINT_CLEARANCE_HEIGHT * 2 &&
    guidance.guides.every(
      ({ rect }) =>
        rect.left + rect.width <= hintRect.left ||
        rect.left >= hintRect.left + hintRect.width ||
        rect.top + rect.height <= hintRect.top ||
        rect.top >= hintRect.top + hintRect.height,
    );
  const hint = guidance.selected ? workspaceDropTargetLabel(guidance.selected.target) : null;
  return (
    <div className={styles.root} aria-hidden="true">
      {guidance.surface && <div className={styles.surface} style={guidance.surface.rect} />}
      {guidance.guides.map((guide) => {
        const selected = guidance.selected?.id === guide.id;
        const vertical =
          guide.target.kind === "workspace" &&
          (guide.target.edge === DockEdge.Left || guide.target.edge === DockEdge.Right);
        const label = guideLabel(guide);
        return (
          <div key={guide.id}>
            {guide.band && (
              <div
                className={styles.band}
                data-selected={selected || undefined}
                data-edge={guide.target.kind === "workspace" ? guide.target.edge : undefined}
                style={guide.band}
              />
            )}
            <div
              className={styles.marker}
              data-selected={selected || undefined}
              data-workspace-drop-guide={guide.id}
              data-guide-scope={guide.scope}
              style={{ position: "absolute", ...guide.rect }}
            >
              {vertical ? (
                <span className={styles.verticalLabel}>
                  {[...label].map((character, index) => (
                    <Text
                      key={index}
                      variant={TextVariant.Inline}
                      scale={GUIDE_LABEL_SCALE}
                      ink="var(--xse-window-tooltip-text, #000000)"
                    >
                      {character}
                    </Text>
                  ))}
                </span>
              ) : (
                <Text
                  variant={TextVariant.Inline}
                  scale={GUIDE_LABEL_SCALE}
                  ink="var(--xse-window-tooltip-text, #000000)"
                >
                  {label}
                </Text>
              )}
            </div>
          </div>
        );
      })}
      {hintClear && hint && (
        <div className={styles.hint}>
          {hint.split(/\s+/).map((word, index) => (
            <Text
              key={index}
              variant={TextVariant.Inline}
              scale={GUIDE_HINT_SCALE}
              ink="var(--xse-window-tooltip-text, #000000)"
            >
              {word}
            </Text>
          ))}
        </div>
      )}
    </div>
  );
}
