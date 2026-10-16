import { useRef, useState, type ReactNode } from "react";

import { ToolStageFooter } from "$/components/shared/tool-action-bar";
import { useToolWindowShade } from "$/components/shared/window-shade";
import {
  Panel,
  PanelVariant,
  ContentLayout,
  ContentPadding,
  Tabs,
  Text,
  TextVariant,
} from "@xprite/ui";
import { useElementSize } from "@xprite/ui/utils";

import styles from "$/components/shared/tool-flow.module.css";

export interface ToolResultTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * The stage window of a flow tool once a file is open: the result, optional detail tabs (the
 * app's Tabs), and the Export footer. With a single tab the strip is left out. Every tab stays
 * mounted so canvas state survives switching.
 */
export function ToolResultWindow({
  title,
  tabs,
  tab,
  onTabChange,
}: {
  title: string;
  tabs: readonly ToolResultTab[];
  tab?: string;
  onTabChange?(id: string): void;
}) {
  const shade = useToolWindowShade("preview");
  const [own, setOwn] = useState(tabs[0].id);
  const active = tabs.some((item) => item.id === (tab ?? own)) ? (tab ?? own) : tabs[0].id;
  const box = useRef<HTMLDivElement>(null);
  const size = useElementSize(box);
  const select = (id: string) => {
    setOwn(id);
    onTabChange?.(id);
  };
  return (
    <div className={styles.resultLayout}>
      <Panel
        {...shade}
        variant={PanelVariant.Document}
        emphasized
        title={title}
        contentLayout={ContentLayout.Fill}
        contentPadding={ContentPadding.Compact}
        className={styles.resultWindow}
        data-ui-window-priority="primary"
        data-tool-canvas-preview=""
      >
        <div className={styles.resultContent}>
          {tabs.length > 1 && (
            <div ref={box} className={styles.resultTabs}>
              {size.ready && (
                <Tabs
                  tabs={tabs.map((item) => ({ id: item.id, label: item.label, closable: false }))}
                  value={active}
                  width={size.width}
                  dragEnabled={false}
                  tabListAriaLabel={title}
                  onValueChange={select}
                />
              )}
            </div>
          )}
          {tabs.map((item) => (
            <div key={item.id} className={styles.pane} hidden={item.id !== active}>
              {item.content}
            </div>
          ))}
          <ToolStageFooter />
        </div>
      </Panel>
    </div>
  );
}

/** A canvas tab body: the canvas fills it, with zoom controls and a status line floating on it. */
export function ToolCanvasPane({
  controls,
  status,
  children,
}: {
  controls?: ReactNode;
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.canvasPane}>
      {controls && <div className={styles.canvasControls}>{controls}</div>}
      {status && (
        <Text variant={TextVariant.Reading} wrap className={styles.canvasStatus}>
          {status}
        </Text>
      )}
      {children}
    </div>
  );
}

/** A list tab body (details, palette, timeline): fills the window and scrolls on its own. */
export function ToolListPane({ children }: { children: ReactNode }) {
  return <div className={styles.listPane}>{children}</div>;
}
