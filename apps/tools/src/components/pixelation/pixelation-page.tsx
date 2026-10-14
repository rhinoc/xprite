import { useSyncExternalStore } from "react";

import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolHelp } from "$/components/shared/tool-help";
import { useToolWindowShade } from "$/components/shared/window-shade";
import type { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { PIXELATE_TOOL } from "$/managers/tools/tool-catalog";
import { PixelationComparison, PixelationControls } from "@xprite/editor-ui";
import { PIXELATE_HELP, PixelateHelpSection } from "@xprite/growth-content/tools";
import {
  Button,
  ContentLayout,
  ContentPadding,
  ControlFlow,
  Panel,
  PanelVariant,
  SurfaceTone,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/pixelation/pixelation.module.css";
export function PixelationPage({ manager }: { manager: PixelationManager }) {
  const shadeSettings = useToolWindowShade("settings");
  const shadePreview = useToolWindowShade("preview");
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  return (
    <FileToolShell
      tool={PIXELATE_TOOL}
      filename={state.name}
      ready={!!state.source}
      processing={busy || state.converting}
      busy={busy}
      error={state.error}
      help={<ToolHelp id={PixelateHelpSection.Overview} content={PIXELATE_HELP} />}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      fileItems={[
        {
          label: "Download PNG",
          disabled: !state.result || busy || state.converting,
          onSelect: () => void manager.download(),
        },
        {
          label: "Continue editing",
          disabled: !state.result || busy || state.converting,
          onSelect: () => void manager.edit(),
        },
      ]}
    >
      {state.source && (
        <div className={styles.layout}>
          <Panel
            {...shadeSettings}
            variant={PanelVariant.Utility}
            emphasized
            tone={SurfaceTone.Accent}
            title="Pixelation"
            contentLayout={ContentLayout.Column}
            contentPadding={ContentPadding.Compact}
            className={styles.settings}
          >
            <PixelationControls
              paletteResources={{
                choices: state.paletteChoices,
                currentPalette: state.defaultPalette,
                previewPalette: state.palettePreview,
                currentLabel: "Use default palette",
                currentName: "Default palette",
                refresh: manager.refreshPalettes,
              }}
              grid={state.grid ?? undefined}
              settings={state.settings}
              sourceSize={state.source}
              disabled={busy}
              onChange={manager.changeSettings}
            />
          </Panel>
          <Panel
            {...shadePreview}
            variant={PanelVariant.Document}
            emphasized
            title={state.name}
            contentPadding={ContentPadding.Compact}
            className={styles.preview}
            data-ui-window-priority="primary"
          >
            <div className={styles.content}>
              <PixelationComparison
                source={state.source}
                result={state.result}
                preparing={state.loading || state.converting}
                mode={state.settings.mode}
              />
              <ControlFlow className={styles.actions}>
                <Text variant={TextVariant.Reading}>
                  {state.converting ? "Preparing preview…" : ""}
                </Text>
                <Button
                  slots={{}}
                  text="Download PNG"
                  disabled={!state.result || busy || state.converting}
                  onClick={() => void manager.download()}
                />
                <Button
                  slots={{}}
                  text="Continue editing"
                  disabled={!state.result || busy || state.converting}
                  onClick={() => void manager.edit()}
                />
              </ControlFlow>
            </div>
          </Panel>
        </div>
      )}
    </FileToolShell>
  );
}
