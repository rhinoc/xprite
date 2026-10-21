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

/**
 * What only the pixelate page adds to the shared base controls. Sampling method and outline
 * protection shape the plain convert, so they are disabled while a recovered grid or an outline
 * pre-pass (whose result the colour picker samples) decides the pixels.
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
  const recovered =
    settings.mode === PixelationMode.RecoverGrid || settings.prepass !== OutlinePrepass.None;
  return (
    <>
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
