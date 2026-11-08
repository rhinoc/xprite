import { type ReactNode } from "react";

import { ChipGroup, Slider, Toggle } from "$/shared/ui/controls";
import { useText } from "$/tools/normalmap/components/context";
import type { NormalToolEditor, NormalToolSnapshot } from "$/tools/normalmap/managers/editor";
import type { MiniToolTextKey } from "$/tools/normalmap/managers/text";
import { NORMAL_LIGHT_LIMITS, NORMAL_MAP_LIMITS, NormalMapPreset } from "@xprite/lighter";

import styles from "$/tools/normalmap/components/normalmap.module.css";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>{children}</span>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  valueText,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  valueText: string;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        valueText={valueText}
        disabled={disabled}
        onChange={onChange}
      />
      <span className={styles.value}>{valueText}</span>
    </div>
  );
}

const LIGHT_COLORS: readonly {
  key: MiniToolTextKey;
  rgb: readonly [number, number, number, number];
}[] = [
  { key: "light.color.daylight", rgb: [255, 255, 255, 255] },
  { key: "light.color.warm", rgb: [255, 210, 150, 255] },
  { key: "light.color.cool", rgb: [170, 205, 255, 255] },
  { key: "light.color.pink", rgb: [255, 160, 205, 255] },
];

export function NormalPanel({
  editor,
  state,
}: {
  editor: NormalToolEditor;
  state: NormalToolSnapshot;
}) {
  const t = useText();
  const options = state.options;
  const slider = (
    key:
      | "shapeStrength"
      | "normalStrength"
      | "smoothing"
      | "facets"
      | "paintedLightAngle"
      | "paintedLightInfluence",
    label: MiniToolTextKey,
    disabled = false,
  ) => (
    <SliderRow
      key={key}
      label={t(label)}
      value={options[key]}
      min={0}
      max={NORMAL_MAP_LIMITS[key]}
      valueText={key === "paintedLightAngle" ? `${options[key]}°` : `${options[key]}`}
      disabled={disabled}
      onChange={(value) => editor.changeOptions({ [key]: value })}
    />
  );
  return (
    <>
      <Field label={t("normal.preset")}>
        <ChipGroup
          scroll
          label={t("normal.preset")}
          value={options.preset}
          options={Object.values(NormalMapPreset).map((value) => ({
            value,
            label: t(`preset.${value}` as MiniToolTextKey),
          }))}
          onChange={editor.changePreset}
        />
      </Field>
      {slider("paintedLightAngle", "normal.delight-angle", options.paintedLightInfluence === 0)}
      {slider("shapeStrength", "normal.shape-strength")}
      {slider("normalStrength", "normal.normal-strength")}
      {slider("smoothing", "normal.smoothing")}
      {slider("facets", "normal.facets")}
      <div className={styles.row}>
        {t("normal.merge-outlines")}
        <Toggle
          label={t("normal.merge-outlines")}
          checked={options.mergeOutlines}
          onChange={(mergeOutlines) => editor.changeOptions({ mergeOutlines })}
        />
      </div>
      <div className={styles.row}>
        {t("normal.invert-y")}
        <Toggle
          label={t("normal.invert-y")}
          checked={options.invertY}
          onChange={(invertY) => editor.changeOptions({ invertY })}
        />
      </div>
      <div className={styles.row}>
        {t("normal.delight")}
        <Toggle
          label={t("normal.delight")}
          checked={state.delightOn}
          onChange={editor.setDelightOn}
        />
      </div>
      {state.delightOn && slider("paintedLightInfluence", "normal.delight-strength")}
    </>
  );
}

export function LightPanel({
  editor,
  state,
}: {
  editor: NormalToolEditor;
  state: NormalToolSnapshot;
}) {
  const t = useText();
  const light = state.light;
  const slider = (key: "height" | "brightness" | "ambient", label: MiniToolTextKey) => (
    <SliderRow
      key={key}
      label={t(label)}
      value={light[key]}
      min={key === "height" ? 1 : 0}
      max={NORMAL_LIGHT_LIMITS[key]}
      valueText={key === "height" ? `${light[key]}px` : `${light[key]}%`}
      onChange={(value) => editor.changeLight({ [key]: value })}
    />
  );
  return (
    <>
      {slider("height", "light.height")}
      {slider("brightness", "light.brightness")}
      {slider("ambient", "light.ambient")}
      <Field label={t("light.color")}>
        <ChipGroup
          scroll
          label={t("light.color")}
          value={LIGHT_COLORS.find((c) => c.rgb.every((v, i) => v === light.color[i]))?.key ?? ""}
          options={LIGHT_COLORS.map((c) => ({ value: c.key, label: t(c.key) }))}
          onChange={(key) => {
            const color = LIGHT_COLORS.find((c) => c.key === key)?.rgb;
            if (color) editor.changeLight({ color: [...color] as typeof light.color });
          }}
        />
      </Field>
    </>
  );
}
