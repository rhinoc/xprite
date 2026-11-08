import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUi } from "$/i18n";
import {
  NORMAL_LIGHT_LIMITS,
  type NormalMapManager,
} from "$/managers/normal-maps/normal-map-manager";
import { Slider } from "@xprite/ui";

const DEFAULT_SLIDER_SIZE = { width: 160, height: 16 };
const LIGHT_SETTINGS_WIDTH = 460;
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
    <FormDialog
      open
      modal={false}
      layoutMode="flow"
      width={LIGHT_SETTINGS_WIDTH}
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
          key: "delight",
          label: tUi("normal.light.delight"),
          type: "checkbox",
          value: manager.delightOn,
          onChange: manager.setDelightOn,
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
  );
}
