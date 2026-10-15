import { useState } from "react";

import { ToolDefaultButton } from "$/components/shared/tool-action-bar";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { Button, Combobox, Field, FieldLayout, FontRole, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

/** One output a flow tool can export, e.g. PNG or PDF. `run` starts the download. */
export interface ToolExportFormat {
  id: string;
  label: string;
  disabled?: boolean;
  run(): void;
}

const MIN_FORMAT_WIDTH = 96;
const MAX_FORMAT_WIDTH = 220;
const CHARACTER_WIDTH = 7;
const POPUP_CHROME = 28;
/** Wide enough for the longest format name, within the sheet. */
function formatWidth(formats: readonly ToolExportFormat[]) {
  const longest = Math.max(...formats.map((format) => format.label.length));
  return Math.min(
    MAX_FORMAT_WIDTH,
    Math.max(MIN_FORMAT_WIDTH, longest * CHARACTER_WIDTH + POPUP_CHROME),
  );
}

/**
 * Standard Mac OS 8 dialog body: a prompt, one format popup, and Cancel plus the ringed default
 * Export button at the bottom right (12px margins).
 */
export function ToolExportSheet({
  formats,
  onClose,
}: {
  formats: readonly ToolExportFormat[];
  onClose(): void;
}) {
  const t = useToolTranslation();
  const [choice, setChoice] = useState(
    () => formats.find((f) => !f.disabled)?.id ?? formats[0]?.id,
  );
  const selected = formats.find((f) => f.id === choice);
  return (
    <div className={styles.exportSheet} data-tool-export-sheet="">
      <Text variant={TextVariant.Reading} wrap>
        {t("Choose an export format")}
      </Text>
      <Field layout={FieldLayout.Inline} label={t("Format")}>
        <Combobox
          pixelWidth={formatWidth(formats)}
          aria-label={t("Format")}
          value={choice ?? ""}
          options={formats.map((f) => ({ value: f.id, label: f.label, disabled: f.disabled }))}
          onValueChange={setChoice}
        />
      </Field>
      <div className={styles.exportSheetButtons}>
        <Button text={t("Cancel")} font={FontRole.Primary} minimumWidth={59} onClick={onClose} />
        <ToolDefaultButton
          text={t("Export")}
          disabled={!selected || selected.disabled}
          data-flow-export-confirm=""
          onClick={() => {
            if (!selected) return;
            onClose();
            selected.run();
          }}
        />
      </div>
    </div>
  );
}
