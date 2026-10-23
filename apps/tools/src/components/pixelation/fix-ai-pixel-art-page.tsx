import { useSyncExternalStore } from "react";

import { PixelationCompare } from "$/components/pixelation/pixelation-compare";
import { PixelationExtraControls } from "$/components/pixelation/pixelation-extras";
import { PixelationPalette } from "$/components/pixelation/pixelation-palette";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolHelp } from "$/components/shared/tool-help";
import { ToolListPane, ToolResultWindow } from "$/components/shared/tool-result-window";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { restoresPixels, type PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { FIX_AI_PIXEL_ART_TOOL } from "$/managers/tools/tool-catalog";
import { PixelationBaseControls } from "@xprite/editor-ui";
import { FIX_AI_PIXEL_ART_HELP, FixAiPixelArtHelpSection } from "@xprite/growth-content/tools";

export function FixAiPixelArtPage({ manager }: { manager: PixelationManager }) {
  const t = useToolTranslation();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const busy = state.loading || state.downloading;
  const ready = !!state.result && !state.converting;
  const restored = restoresPixels(state);
  return (
    <FileToolShell
      tool={FIX_AI_PIXEL_ART_TOOL}
      filename={state.name}
      ready={!!state.source}
      processing={busy || state.converting}
      busy={busy}
      error={state.error}
      help={
        <ToolHelp id={FixAiPixelArtHelpSection.Overview} content={FIX_AI_PIXEL_ART_HELP} />
      }
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      onReset={() => manager.clear()}
      flow={{
        exportDisabled: !ready,
        editMore: { run: () => void manager.edit() },
        adjust: state.source && (
          <PixelationBaseControls
            paletteResources={{
              choices: state.paletteChoices,
              previewPalette: state.palettePreview,
              refresh: manager.refreshPalettes,
            }}
            algorithm={state.algorithm}
            grid={state.grid ?? undefined}
            settings={state.settings}
            sourceSize={state.source}
            busy={busy}
            translate={(text, values) =>
              t(text).replace(/\{([^}]+)\}/g, (match, key: string) =>
                String(values?.[key] ?? match),
              )
            }
            onChange={manager.changeSettings}
            onAlgorithm={(algorithm, size) => void manager.changeAlgorithm(algorithm, size)}
          >
            <PixelationExtraControls
              settings={state.settings}
              disabled={busy}
              onChange={manager.changeSettings}
            />
          </PixelationBaseControls>
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
                  resultName={t(restored ? "Fixed" : "Result")}
                  resultImageLabel={t(restored ? "Fixed image" : "Result image")}
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
