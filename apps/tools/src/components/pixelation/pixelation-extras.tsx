import { ToolField, ToolGroup } from "$/components/shared/tool-group";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  OutlinePrepass,
  PIXELATION_METHOD_OPTIONS,
  PixelationMethod,
  PixelationMode,
  type PixelationSettings,
} from "@xprite/editor-core/import-export";
import { Checkbox, Combobox, Input } from "@xprite/ui";

const NUMBER_WIDTH = 36;
const METHOD_WIDTH = 112;
const ACTION_WIDTH = 148;

const ACTION_OPTIONS = [
  { value: PixelationMode.Convert, label: "Convert image" },
  { value: PixelationMode.RecoverGrid, label: "Recover pixel grid" },
] as const;

/**
 * What only the pixelate page adds to the shared base controls. Action puts Convert first so
 * photo→pixel SERP intent stays primary; Recover Grid stays one control away. Sampling method
 * and outline protection shape the plain convert, so they are disabled while a recovered grid
 * or an outline pre-pass (whose result the colour picker samples) decides the pixels.
 */
export function PixelationExtraControls({
  settings,
  disabled,
  onChange,
}: {
  settings: Readonly<PixelationSettings>;
  disabled: boolean;
  onChange(patch: Partial<PixelationSettings>): void;
}) {
  const t = useToolTranslation();
  const recovering = settings.mode === PixelationMode.RecoverGrid;
  const recovered = recovering || settings.prepass !== OutlinePrepass.None;
  return (
    <>
      <ToolGroup title={t("Action")}>
        <ToolField label={t("Action")}>
          <Combobox
            pixelWidth={ACTION_WIDTH}
            value={settings.mode}
            aria-label={t("Action")}
            disabled={disabled}
            options={ACTION_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.label),
            }))}
            onValueChange={(mode) => onChange({ mode: mode as PixelationMode })}
          />
        </ToolField>
        {recovering && (
          <>
            <Checkbox
              label={t("Automatic grid")}
              checked={settings.autoGrid}
              disabled={disabled}
              onCheckedChange={(autoGrid) => onChange({ autoGrid })}
            />
            {!settings.autoGrid && (
              <>
                <ToolField label={t("Cell width")}>
                  <Input
                    pixelWidth={NUMBER_WIDTH}
                    value={String(settings.gridCellWidth)}
                    inputMode="numeric"
                    min={1}
                    max={128}
                    step={1}
                    disabled={disabled}
                    onCommit={(value) => onChange({ gridCellWidth: Number(value) })}
                  />
                </ToolField>
                <ToolField label={t("Cell height")}>
                  <Input
                    pixelWidth={NUMBER_WIDTH}
                    value={String(settings.gridCellHeight)}
                    inputMode="numeric"
                    min={1}
                    max={128}
                    step={1}
                    disabled={disabled}
                    onCommit={(value) => onChange({ gridCellHeight: Number(value) })}
                  />
                </ToolField>
              </>
            )}
          </>
        )}
      </ToolGroup>
      <ToolGroup title={t("Sampling")}>
        <ToolField label={t("Method")}>
          <Combobox
            pixelWidth={METHOD_WIDTH}
            value={settings.method}
            aria-label={t("Method")}
            disabled={disabled || recovered}
            options={PIXELATION_METHOD_OPTIONS.map((option) => ({
              ...option,
              label: t(option.label),
            }))}
            onValueChange={(method) => onChange({ method: method as PixelationMethod })}
          />
        </ToolField>
        <ToolField label={t("Outline protection")}>
          <Input
            pixelWidth={NUMBER_WIDTH}
            value={String(settings.outlineStrength)}
            inputMode="numeric"
            min={0}
            max={100}
            step={10}
            disabled={disabled || recovered}
            onCommit={(value) => onChange({ outlineStrength: Number(value) })}
          />
        </ToolField>
      </ToolGroup>
      <ToolGroup title={t("Output")}>
        <Checkbox
          label={t("Remove noise")}
          checked={settings.removeNoise}
          disabled={disabled}
          onCheckedChange={(removeNoise) => onChange({ removeNoise })}
        />
        <Checkbox
          label={t("Keep original dimensions")}
          checked={settings.preserveDimensions}
          disabled={disabled}
          onCheckedChange={(preserveDimensions) => onChange({ preserveDimensions })}
        />
      </ToolGroup>
    </>
  );
}
