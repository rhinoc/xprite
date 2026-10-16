import { useState } from "react";

import {
  Button,
  Checkbox,
  CheckboxMode,
  Combobox,
  Input,
  Tabs,
  Text,
  TextVariant,
} from "@xprite/ui";

/** Labels with no Latin descenders so ink spans compare cleanly across scripts. */
export const ALIGNMENT_PROBE_LABELS = {
  en: "Tile Grid",
  "zh-CN": "图块网格",
  ja: "タイルグリッド",
} as const;

export type AlignmentProbeLanguage = keyof typeof ALIGNMENT_PROBE_LABELS;

const ROW_HEIGHT = 64;

function Row({
  name,
  index,
  children,
}: {
  name: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-alignment-probe={name}
      style={{
        position: "absolute",
        left: 16,
        top: 16 + index * ROW_HEIGHT,
        width: 240,
        height: 48,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Renders one control per row with the same label in the requested script. Used by
 * scripts/visual-audit/text-alignment.mjs to measure that one central CJK offset aligns every
 * text-rendering component with Latin. Reached with `?alignment-probe=<en|zh-CN|ja>`.
 */
export function AlignmentProbe({ language }: { language: AlignmentProbeLanguage }) {
  // Skins without a `combobox_height` dimension (Aseprite) need an explicit select height.
  const selectHeight = Number(new URLSearchParams(window.location.search).get("select-height"));
  const label = ALIGNMENT_PROBE_LABELS[language];
  const [checked, setChecked] = useState(true);
  return (
    <div
      data-alignment-probe-root={language}
      style={{ position: "fixed", inset: 0, background: "#fff", color: "#000" }}
    >
      <Row name="checkbox" index={0}>
        <Checkbox label={label} checked={checked} onCheckedChange={setChecked} />
      </Row>
      <Row name="radio" index={1}>
        <Checkbox
          label={label}
          mode={CheckboxMode.Radio}
          checked={checked}
          onCheckedChange={setChecked}
        />
      </Row>
      <Row name="input" index={2}>
        <Input aria-label="probe" pixelWidth={120} value={label} onValueChange={() => {}} />
      </Row>
      <Row name="button" index={3}>
        <Button slots={{}} text={label} />
      </Row>
      <Row name="select" index={4}>
        <Combobox
          aria-label="probe"
          {...(selectHeight
            ? { pixelSize: { width: 120, height: selectHeight } }
            : { pixelWidth: 120 })}
          value="a"
          options={[{ value: "a", label }]}
          onValueChange={() => {}}
        />
      </Row>
      <Row name="tabs" index={5}>
        <Tabs
          tabs={[{ id: "a", label, closable: false }]}
          value="a"
          width={240}
          dragEnabled={false}
          onValueChange={() => {}}
        />
      </Row>
      <Row name="label" index={6}>
        <Text variant={TextVariant.Control} pixelSize={{ width: 120, height: 20 }} text={label} />
      </Row>
      <Row name="inline" index={7}>
        <Text variant={TextVariant.Inline}>{label}</Text>
      </Row>
    </div>
  );
}
