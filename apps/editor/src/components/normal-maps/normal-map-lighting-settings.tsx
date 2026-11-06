import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { EditorDialog } from "$/components/dialogs/overlay";
import { tUi } from "$/i18n";
import {
  NORMAL_LIGHT_LIMITS,
  type NormalMapManager,
} from "$/managers/normal-maps/normal-map-manager";
import { Slider } from "@xprite/ui";

import styles from "$/components/normal-maps/normal-maps.module.css";

const DEFAULT_SLIDER_SIZE = { width: 160, height: 16 };
const LIGHT_WINDOW_BOUNDS = { x: 40, y: 80, width: 520, height: 520 };
const LIGHT_WINDOW_MINIMUM = { width: 280, height: 300 };
export function NormalMapLightingSettings({
  manager,
  follow,
  setFollow,
  onClose,
}: {
  manager: NormalMapManager;
  follow: boolean;
  setFollow(value: boolean): void;
  onClose(): void;
}) {
  const slider = (key: "height" | "brightness" | "ambient", label: string): FormField => ({
    key,
    label,
    type: "custom",
    render: (placement) => (
      <Slider
        {...(placement.bounds
          ? placement
          : { pixelSize: placement.pixelSize ?? DEFAULT_SLIDER_SIZE })}
        value={manager.light[key]}
        label={
          key === "height"
            ? tUi("normal.light.pixels", { value1: manager.light[key] })
            : `${manager.light[key]}%`
        }
        min={key === "height" ? 1 : 0}
        max={NORMAL_LIGHT_LIMITS[key]}
        aria-label={label}
        onValueChange={(value) => manager.setLight((light) => ({ ...light, [key]: value }))}
      />
    ),
  });
  const color = `#${manager.light.color
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
  return (
    <EditorDialog
      open
      title={tUi("normal.light.settings")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      defaultBounds={LIGHT_WINDOW_BOUNDS}
      minSize={LIGHT_WINDOW_MINIMUM}
      centerOnOpen
      resizable
      constrainToViewport
      autoFocus={false}
    >
      {({ clientBounds }) => (
        <div className={styles.lightPanel}>
          <FormDialog
            embedded
            open
            layoutMode="flow"
            scrollFields
            width={clientBounds.width}
            height={clientBounds.height}
            title={tUi("normal.light.settings")}
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
            submitOnEnter={false}
            fields={[
              {
                key: "diffuse",
                label: tUi("normal.diffuse"),
                type: "select",
                value: manager.diffuseId,
                options: manager.diffuseChoices,
                onChange: manager.setDiffuseId,
              },
              {
                key: "normal",
                label: tUi("normal.map"),
                type: "select",
                value: manager.normalId,
                options: manager.normalChoices,
                onChange: manager.setNormalId,
              },
              slider("height", tUi("normal.light.height")),
              slider("brightness", tUi("normal.light.brightness")),
              slider("ambient", tUi("normal.light.ambient")),
              {
                key: "color",
                label: tUi("normal.light.color"),
                type: "color",
                value: color,
                onChange: manager.setLightColor,
              },
              {
                key: "follow",
                label: tUi("normal.light.follow"),
                type: "checkbox",
                value: follow,
                onChange: setFollow,
              },
              {
                key: "invert",
                label: tUi("normal.invertY"),
                type: "checkbox",
                value: manager.light.invertY,
                onChange: (invertY) => manager.setLight((light) => ({ ...light, invertY })),
              },
            ]}
            actions={[{ label: "Close", onClick: onClose }]}
          />
        </div>
      )}
    </EditorDialog>
  );
}
