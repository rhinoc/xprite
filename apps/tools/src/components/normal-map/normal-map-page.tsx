import { useSyncExternalStore } from "react";

import { ToolLightPreview } from "$/components/normal-map/light-preview";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolField, ToolFullField, ToolGroup } from "$/components/shared/tool-group";
import { ToolHelp } from "$/components/shared/tool-help";
import { ToolCanvasPane, ToolResultWindow } from "$/components/shared/tool-result-window";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  NORMAL_MAP_LIMITS,
  NormalMapPreset,
  NormalMapStatus,
  type NormalMapManager,
} from "$/managers/normal-map/normal-map-manager";
import { NORMAL_MAP_TOOL } from "$/managers/tools/tool-catalog";
import { NORMAL_LIGHT_LIMITS } from "@xprite/editor-core/image-editing";
import { NORMAL_MAP_HELP, NormalMapHelpSection } from "@xprite/growth-content/tools";
import { Checkbox, Combobox, Slider } from "@xprite/ui";

import styles from "$/components/normal-map/normal-map-page.module.css";

const SLIDER_SIZE = { width: 120, height: 20 };
const PRESET_WIDTH = 110;
const PRESET_LABELS: Record<NormalMapPreset, string> = {
  [NormalMapPreset.Architecture]: "Architecture",
  [NormalMapPreset.Character]: "Character",
  [NormalMapPreset.Object]: "Object",
  [NormalMapPreset.Terrain]: "Terrain",
};

export function NormalMapPage({ manager }: { manager: NormalMapManager }) {
  const t = useToolTranslation();
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const busy = snapshot.status === NormalMapStatus.Loading || snapshot.openingEditor;
  const loaded = snapshot.status === NormalMapStatus.Ready;
  const pixels = snapshot.pixels;
  const light = snapshot.light;
  const lightPixels = snapshot.lightPixels;
  const options = snapshot.options;
  const slider = (
    key:
      | "shapeStrength"
      | "normalStrength"
      | "smoothing"
      | "facets"
      | "paintedLightInfluence"
      | "paintedLightAngle",
    label: string,
    max: number,
    disabled = false,
  ) => (
    <ToolField label={t(label)}>
      <Slider
        pixelSize={SLIDER_SIZE}
        aria-label={t(label)}
        value={options[key]}
        label={key === "paintedLightAngle" ? `${options[key]}°` : `${options[key]}%`}
        min={0}
        max={max}
        disabled={!loaded || disabled}
        onValueChange={(value) => manager.changeOptions({ [key]: value })}
      />
    </ToolField>
  );
  const lightSlider = (
    key: "height" | "brightness" | "ambient" | "maskStrength",
    label: string,
    max: number,
    disabled = false,
  ) => (
    <ToolField label={t(label)}>
      <Slider
        pixelSize={SLIDER_SIZE}
        aria-label={t(label)}
        value={light[key]}
        label={key === "height" ? `${light[key]} px` : `${light[key]}%`}
        min={0}
        max={max}
        disabled={!loaded || !lightPixels || disabled}
        onValueChange={(value) => manager.changeLight({ [key]: value })}
      />
    </ToolField>
  );
  const outputDisabled = !loaded || !pixels || snapshot.downloading || busy;
  return (
    <FileToolShell
      tool={NORMAL_MAP_TOOL}
      help={<ToolHelp id={NormalMapHelpSection.Overview} content={NORMAL_MAP_HELP} />}
      filename={snapshot.name}
      busy={busy}
      ready={loaded}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      onReset={() => manager.clear()}
      flow={{
        exportDisabled: outputDisabled,
        editMore: { run: () => void manager.openEditor() },
        adjust: (
          <>
            <ToolGroup title={t("Normal map")}>
              <ToolFullField label={t("Preset:")}>
                <Combobox
                  pixelWidth={PRESET_WIDTH}
                  aria-label={t("Preset")}
                  value={options.preset}
                  disabled={!loaded}
                  options={Object.values(NormalMapPreset).map((preset) => ({
                    value: preset,
                    label: t(PRESET_LABELS[preset]),
                  }))}
                  onValueChange={(preset) => manager.selectPreset(preset as NormalMapPreset)}
                />
              </ToolFullField>
              {slider("shapeStrength", "Shape strength:", NORMAL_MAP_LIMITS.shapeStrength)}
              {slider("normalStrength", "Normal strength:", NORMAL_MAP_LIMITS.normalStrength)}
              {slider("smoothing", "Smoothing:", NORMAL_MAP_LIMITS.smoothing)}
              {slider("facets", "Facets:", NORMAL_MAP_LIMITS.facets)}
              {slider(
                "paintedLightInfluence",
                "Painted light:",
                NORMAL_MAP_LIMITS.paintedLightInfluence,
              )}
              {slider(
                "paintedLightAngle",
                "Light angle:",
                NORMAL_MAP_LIMITS.paintedLightAngle,
                options.paintedLightInfluence === 0,
              )}
            </ToolGroup>
            <ToolGroup title={t("Preview light")}>
              {lightSlider("height", "Light height:", NORMAL_LIGHT_LIMITS.height)}
              {lightSlider("brightness", "Brightness:", NORMAL_LIGHT_LIMITS.brightness)}
              {lightSlider("ambient", "Ambient:", NORMAL_LIGHT_LIMITS.ambient)}
            </ToolGroup>
            <ToolGroup title={t("Options")}>
              <Checkbox
                label={t("Merge outlines")}
                checked={options.mergeOutlines}
                disabled={!loaded}
                onCheckedChange={(mergeOutlines) => manager.changeOptions({ mergeOutlines })}
              />
              <Checkbox
                label={t("Invert Y")}
                title={t("Flip the green channel for DirectX-style normal maps")}
                checked={options.invertY}
                disabled={!loaded}
                onCheckedChange={(invertY) => manager.changeOptions({ invertY })}
              />
            </ToolGroup>
          </>
        ),
        exportFormats: [
          {
            id: "png",
            label: t("Export normal map (.png)"),
            disabled: outputDisabled,
            run: () => void manager.download(),
          },
        ],
      }}
    >
      {loaded && (
        <ToolResultWindow
          title={snapshot.name}
          tabs={[
            {
              id: "preview",
              label: t("Preview"),
              content: (
                <ToolCanvasPane>
                  <div className={styles.previewGrid}>
                    <div className={styles.previewCell}>
                      {pixels && (
                        <ToolCanvasPreview
                          navigation={manager.viewport}
                          identity={snapshot.identity}
                          pixels={pixels}
                          label={t(
                            "Normal map preview. Drag to pan, scroll to zoom, double-click to fit.",
                          )}
                        />
                      )}
                      <span className={styles.previewLabel}>{t("Normal map")}</span>
                    </div>
                    <div className={styles.previewCell}>
                      {lightPixels && (
                        <ToolLightPreview
                          navigation={manager.lightViewport}
                          identity={snapshot.identity}
                          pixels={lightPixels}
                          label={t(
                            "Lighting preview. Drag to move the light; middle-drag to pan, scroll to zoom, double-click to fit.",
                          )}
                          light={light.position}
                          guide={
                            light.brightness > 0
                              ? 2 * 32 * Math.sqrt(Math.max(0, light.brightness / 100 / 0.2 - 1))
                              : 0
                          }
                          onLightMove={(point) => manager.moveLight(point.x, point.y)}
                        />
                      )}
                      <span className={styles.previewLabel}>{t("Lighting")}</span>
                    </div>
                  </div>
                  <div className={styles.previewZoom}>
                    <ToolZoomControl navigation={manager.viewport} />
                  </div>
                </ToolCanvasPane>
              ),
            },
          ]}
        />
      )}
    </FileToolShell>
  );
}
