import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { NormalMapError } from "$/components/normal-maps/normal-map-error";
import { NormalMapImage } from "$/components/normal-maps/normal-map-image";
import { tUi } from "$/i18n";
import {
  NormalPreset,
  NormalPreviewView,
  NORMAL_GENERATOR_LIMITS,
  type NormalMapManager,
  type NormalGeneratorOptions,
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
    key: "shapeStrength" | "normalStrength" | "smoothing" | "facets",
    label: string,
  ): FormField => ({
    key,
    label,
    type: "custom",
    render: (placement) => (
      <Slider
        {...(placement.bounds
          ? placement
          : { pixelSize: placement.pixelSize ?? DEFAULT_SLIDER_SIZE })}
        value={options[key]}
        label={key === "smoothing" ? String(options[key]) : `${options[key]}%`}
        min={STRENGTH_STEP_MIN}
        max={NORMAL_GENERATOR_LIMITS[key]}
        aria-label={label}
        onValueChange={(value) => manager.setOptions({ ...options, [key]: value })}
      />
    ),
  });
  const patch = (value: Partial<NormalGeneratorOptions>) =>
    manager.setOptions({ ...options, ...value });
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
      title={tUi("normal.generate.title")}
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
              { value: NormalPreviewView.Normal, label: tUi("normal.view.normal") },
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
        slider("shapeStrength", tUi("normal.shapeStrength")),
        slider("normalStrength", tUi("normal.normalStrength")),
        slider("smoothing", tUi("normal.smoothing")),
        slider("facets", tUi("normal.facets")),
        {
          key: "merge",
          label: tUi("normal.mergeOutlines"),
          type: "checkbox",
          value: options.mergeOutlines,
          onChange: (mergeOutlines) => patch({ mergeOutlines }),
        },
        {
          key: "invert",
          label: tUi("normal.invertY"),
          type: "checkbox",
          value: options.invertY,
          onChange: (invertY) => patch({ invertY }),
        },
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
