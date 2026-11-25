import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { NormalMapError } from "$/components/normal-maps/normal-map-error";
import { NormalMapImage } from "$/components/normal-maps/normal-map-image";
import { tUi } from "$/i18n";
import {
  NormalPreset,
  NormalPreviewView,
  NORMAL_GENERATOR_LIMITS,
  LIGHT_MASK_LIMITS,
  type NormalMapManager,
} from "$/managers/normal-maps/normal-map-manager";
import { Button, ControlFlow, FontRole, ProgressBar, Slider, Text, TextVariant } from "@xprite/ui";
import { RASTER_SCALE } from "@xprite/ui/canvas";

import styles from "$/components/normal-maps/normal-maps.module.css";

const DEFAULT_SLIDER_SIZE = { width: 160, height: 16 };
const GENERATOR_DIALOG_WIDTH = 660;
const GENERATOR_DIALOG_HEIGHT = 700;
const STRENGTH_STEP_MIN = 0;
export function NormalMapGenerationDialog({ manager }: { manager: NormalMapManager }) {
  const { options, batchRunning: locked } = manager;
  const slider = (
    key: string,
    label: string,
    value: number,
    max: number,
    onChange: (value: number) => void,
    unit: string,
    disabled = false,
  ): FormField => ({
    key,
    label,
    type: "custom",
    disabled: locked || disabled,
    render: (placement) => (
      <Slider
        {...(placement.bounds
          ? placement
          : { pixelSize: placement.pixelSize ?? DEFAULT_SLIDER_SIZE })}
        value={value}
        label={`${value}${unit}`}
        min={STRENGTH_STEP_MIN}
        max={max}
        aria-label={label}
        disabled={locked || disabled}
        onValueChange={onChange}
      />
    ),
  });
  const normalSlider = (
    key: keyof typeof NORMAL_GENERATOR_LIMITS,
    label: string,
    disabled = false,
  ) =>
    slider(
      key,
      label,
      options[key],
      NORMAL_GENERATOR_LIMITS[key],
      (value) => manager.setOptions({ [key]: value }),
      key === "paintedLightAngle" ? "°" : key === "smoothing" ? "" : "%",
      disabled,
    );
  const maskSlider = (key: keyof typeof LIGHT_MASK_LIMITS, label: string) =>
    slider(
      key,
      label,
      manager.maskOptions[key],
      LIGHT_MASK_LIMITS[key],
      (value) => manager.setMaskOptions({ ...manager.maskOptions, [key]: value }),
      key === "strength" || key === "cavity" ? "%" : "",
    );
  const accept = () => {
    if (manager.canApply) void manager.apply(true);
    else if (!manager.generating && !locked && !manager.error) manager.closeGeneration();
  };
  const batchProgressText = manager.batchProgress
    ? tUi(manager.generatingMask ? "normal.batch.maskProgress" : "normal.batch.progress", {
        value1: manager.batchProgress.completed,
        value2: manager.batchProgress.total,
      })
    : "";
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (locked) manager.cancelBatch();
          else manager.closeGeneration();
        }
      }}
      title={tUi(manager.generatingMask ? "normal.mask.generate" : "normal.generate.title")}
      width={GENERATOR_DIALOG_WIDTH}
      height={GENERATOR_DIALOG_HEIGHT}
      scrollFields
      layoutMode="flow"
      beforeActions={
        <>
          <NormalMapImage
            pixels={manager.generationPixels}
            label={tUi("normal.preview")}
            followLight={manager.view === NormalPreviewView.Light}
            processing={manager.generating}
            lighting={manager.view === NormalPreviewView.Light ? manager.generationLighting : null}
          />
          <div className={styles.previewBar}>
            <ControlFlow className={styles.viewModes} style={{ gap: 0, flexWrap: "nowrap" }}>
              {[
                { value: NormalPreviewView.Original, label: tUi("normal.view.original") },
                {
                  value: NormalPreviewView.Normal,
                  label: tUi(manager.generatingMask ? "normal.mask" : "normal.view.normal"),
                },
                { value: NormalPreviewView.Light, label: tUi("normal.view.light") },
              ].map(({ value, label }) => (
                <Button
                  key={value}
                  text={label}
                  aria-label={label}
                  font={FontRole.Compact}
                  part="buttonset_item_normal"
                  hotPart="buttonset_item_hot"
                  selected={manager.view === value}
                  aria-pressed={manager.view === value}
                  onClick={() => manager.setView(value)}
                />
              ))}
            </ControlFlow>
            {manager.targetFrameCount > 1 && (
              <div className={styles.frameStepper}>
                <Button
                  icon="ani_previous"
                  tintIcon
                  aria-label={tUi("normal.preview.prevFrame")}
                  part="buttonset_item_normal"
                  hotPart="buttonset_item_hot"
                  disabled={locked}
                  onClick={() => manager.stepPreviewFrame(-1)}
                />
                <span className={styles.frameStepperLabel}>
                  <Text variant={TextVariant.Inline} scale={RASTER_SCALE}>
                    {tUi("normal.preview.frame", {
                      value1: manager.previewFrame + 1,
                      value2: manager.previewFrameIndex + 1,
                      value3: manager.targetFrameCount,
                    })}
                  </Text>
                </span>
                <Button
                  icon="ani_next"
                  tintIcon
                  aria-label={tUi("normal.preview.nextFrame")}
                  part="buttonset_item_normal"
                  hotPart="buttonset_item_hot"
                  disabled={locked}
                  onClick={() => manager.stepPreviewFrame(1)}
                />
              </div>
            )}
          </div>
          {manager.batchProgress && (
            <div className={styles.batchProgress}>
              <Text variant={TextVariant.Inline} scale={RASTER_SCALE}>
                {batchProgressText}
              </Text>
              <ProgressBar
                label={batchProgressText}
                value={manager.batchProgress.completed / Math.max(1, manager.batchProgress.total)}
              />
            </div>
          )}
        </>
      }
      fields={[
        {
          key: "source",
          label: tUi("normal.source"),
          type: "select",
          value: manager.sourceId,
          options: manager.sourceChoices,
          disabled: locked,
          onChange: manager.setSourceId,
        },
        ...(manager.showFrameScope
          ? [
              {
                key: "frames",
                label: tUi("normal.frames"),
                type: "select" as const,
                value: manager.frameScope,
                options: manager.frameScopeChoices,
                disabled: locked,
                onChange: manager.setFrameScope,
              },
            ]
          : []),
        ...(manager.generatingMask
          ? [
              maskSlider("strength", tUi("normal.mask.shading")),
              maskSlider("floor", tUi("normal.mask.darkest")),
              maskSlider("ceiling", tUi("normal.mask.lightest")),
              maskSlider("cavity", tUi("normal.mask.cavity")),
            ]
          : ([
              {
                key: "preset",
                label: tUi("normal.preset"),
                type: "select",
                value: options.preset,
                disabled: locked,
                options: [
                  { value: NormalPreset.Architecture, label: tUi("normal.preset.architecture") },
                  { value: NormalPreset.Character, label: tUi("normal.preset.character") },
                  { value: NormalPreset.Object, label: tUi("normal.preset.object") },
                  { value: NormalPreset.Terrain, label: tUi("normal.preset.terrain") },
                ],
                onChange: (value) => manager.selectPreset(value as NormalPreset),
              },
              normalSlider(
                "paintedLightAngle",
                tUi("normal.painted.angle"),
                options.paintedLightInfluence === 0,
              ),
              normalSlider("shapeStrength", tUi("normal.shapeStrength")),
              normalSlider("normalStrength", tUi("normal.normalStrength")),
              normalSlider("smoothing", tUi("normal.smoothing")),
              normalSlider("facets", tUi("normal.facets")),
              normalSlider("paintedLightInfluence", tUi("normal.painted.influence")),
              {
                key: "shading-source",
                label: tUi("normal.painted.source"),
                type: "select",
                value: manager.shadingSourceId,
                options: manager.shadingSourceChoices,
                disabled: locked || options.paintedLightInfluence === 0,
                onChange: manager.setShadingSourceId,
              },
              {
                key: "merge",
                label: tUi("normal.mergeOutlines"),
                type: "checkbox",
                value: options.mergeOutlines,
                disabled: locked,
                onChange: (mergeOutlines) => manager.setOptions({ mergeOutlines }),
              },
              {
                key: "invert",
                label: tUi("normal.invertY"),
                type: "checkbox",
                value: options.invertY,
                disabled: locked,
                onChange: (invertY) => manager.setOptions({ invertY }),
              },
            ] satisfies FormField[])),
      ]}
      overlay={<NormalMapError error={manager.error} />}
      actions={[
        { label: "OK", onClick: accept, disabled: locked || manager.generating || !!manager.error },
        {
          label: "Apply",
          onClick: () => {
            void manager.apply(false);
          },
          disabled: !manager.canApply,
        },
        {
          label: locked ? tUi("normal.batch.stop") : "Cancel",
          onClick: locked ? manager.cancelBatch : manager.closeGeneration,
        },
      ]}
    />
  );
}
