import { useSyncExternalStore } from "react";

import { PixelationCompare } from "$/components/pixelation/pixelation-compare";
import { PixelationPalette } from "$/components/pixelation/pixelation-palette";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolHelp } from "$/components/shared/tool-help";
import { ToolListPane, ToolResultWindow } from "$/components/shared/tool-result-window";
import { useToolTranslation } from "$/managers/locale/tool-language";
import type { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { PIXELATE_TOOL } from "$/managers/tools/tool-catalog";
import { PixelationMode } from "@xprite/editor-core/import-export";
import { PixelationControls } from "@xprite/editor-ui";
import { PIXELATE_HELP, PixelateHelpSection } from "@xprite/growth-content/tools";

export function PixelationPage({ manager }: { manager: PixelationManager }) {
  const t = useToolTranslation();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  const ready = !!state.result && !state.converting;
  const restored = state.settings.mode === PixelationMode.RecoverGrid;
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
      onReset={() => manager.clear()}
      flow={{
        exportDisabled: !ready,
        editMore: { run: () => void manager.edit() },
        adjust: state.source && (
          <PixelationControls
            grouped
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
            translate={(text, values) =>
              t(text).replace(/\{([^}]+)\}/g, (match, key: string) =>
                String(values?.[key] ?? match),
              )
            }
            onChange={manager.changeSettings}
          />
        ),
        exportFormats: [
          {
            id: "png",
            label: t("PNG image (.png)"),
            disabled: !ready,
            run: () => void manager.download(),
          },
        ],
      }}
    >
      {state.source && (
        <ToolResultWindow
          title={state.name}
          tabs={[
            {
              id: "comparison",
              label: t("Comparison"),
              content: (
                <PixelationCompare
                  navigation={manager.navigation}
                  identity={state.identity}
                  source={state.source}
                  result={state.result}
                  preparing={state.loading || state.converting}
                  restored={restored}
                />
              ),
            },
            {
              id: "palette",
              label: t("Palette"),
              content: (
                <ToolListPane>
                  {state.result ? <PixelationPalette pixels={state.result} /> : null}
                </ToolListPane>
              ),
            },
          ]}
        />
      )}
    </FileToolShell>
  );
}
