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
import { Button, ControlFlow, FontRole, Slider } from "@xprite/ui";

import styles from "$/components/normal-maps/normal-maps.module.css";

const DEFAULT_SLIDER_SIZE = { width: 160, height: 16 };
const GENERATOR_DIALOG_WIDTH = 660;
const GENERATOR_DIALOG_HEIGHT = 700;
const STRENGTH_STEP_MIN = 0;
export function NormalMapGenerationDialog({ manager }: { manager: NormalMapManager }) {
  const { options } = manager;
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
    disabled,
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
        disabled={disabled}
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
    if (manager.canApply ? manager.apply() : !manager.generating && !manager.error)
      manager.closeGeneration();
  };
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) manager.closeGeneration();
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
        </>
      }
      fields={[
        {
          key: "source",
          label: tUi("normal.source"),
          type: "select",
          value: manager.sourceId,
          options: manager.sourceChoices,
          onChange: manager.setSourceId,
        },
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
                disabled: options.paintedLightInfluence === 0,
                onChange: manager.setShadingSourceId,
              },
              {
                key: "merge",
                label: tUi("normal.mergeOutlines"),
                type: "checkbox",
                value: options.mergeOutlines,
                onChange: (mergeOutlines) => manager.setOptions({ mergeOutlines }),
              },
              {
                key: "invert",
                label: tUi("normal.invertY"),
                type: "checkbox",
                value: options.invertY,
                onChange: (invertY) => manager.setOptions({ invertY }),
              },
            ] satisfies FormField[])),
      ]}
      overlay={<NormalMapError error={manager.error} />}
      actions={[
        { label: "OK", onClick: accept, disabled: manager.generating || !!manager.error },
        {
          label: "Apply",
          onClick: () => {
            manager.apply();
          },
          disabled: !manager.canApply,
        },
        { label: "Cancel", onClick: manager.closeGeneration },
      ]}
    />
  );
}
