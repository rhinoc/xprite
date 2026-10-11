import { PalettePresetPopup } from "$/palette";
import type { PaletteBrowserChoice, PaletteTranslate } from "$/palette/model";
import type { Rgba } from "@xprite/editor-core/base";
import type { PixelationSettings } from "@xprite/editor-core/import-export";
import { Button, ButtonVariant, ControlFlow, ScrollArea, Text, TextVariant } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";

import styles from "$/pixelation/pixelation.module.css";
const MAX_COLORS = 256;
const SWATCH_SIZE = { width: 10, height: 10 };
export interface PixelationPaletteResources {
  choices: readonly PaletteBrowserChoice[];
  currentPalette: readonly Rgba[];
  previewPalette: readonly Rgba[];
  currentLabel: string;
  currentName: string;
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  refresh(): void;
}
export function PixelationPaletteControl({
  settings,
  resources,
  disabled,
  translate,
  onChange,
}: {
  settings: Readonly<PixelationSettings>;
  resources: PixelationPaletteResources;
  disabled: boolean;
  translate: PaletteTranslate;
  onChange(patch: Partial<PixelationSettings>): void;
}) {
  const colors = settings.palette ?? resources.previewPalette;
  const apply = (palette: readonly Rgba[], paletteName: string) =>
    onChange({ palette, paletteName, reduceColors: true });
  const rgba = (color: Rgba) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
  const hex = (color: Rgba) =>
    `#${color
      .slice(0, 3)
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  return (
    <div className={styles.paletteControl}>
      <ControlFlow className={styles.paletteHeader}>
        <Text variant={TextVariant.Reading} wrap>
          {settings.palette ? settings.paletteName : translate("Automatic palette")}
        </Text>
        <PalettePresetPopup
          choices={resources.choices}
          activePalette={colors}
          hasDocument={!disabled}
          disabled={disabled}
          maxColors={MAX_COLORS}
          requireVisibleColors
          sceneBounds={resources.sceneBounds}
          translate={translate}
          onRefresh={resources.refresh}
          onLoad={(palette, choice) => apply(palette, choice.name)}
        />
      </ControlFlow>
      {!!colors.length && (
        <ScrollArea
          scrollX={false}
          className={styles.paletteScroll}
          aria-label={translate("Palette colors")}
        >
          <div className={styles.paletteGrid}>
            {colors.map((color, index) => (
              <Button
                key={index}
                slots={{}}
                variant={ButtonVariant.Color}
                readOnly
                pixelSize={SWATCH_SIZE}
                swatchColor={rgba(color)}
                swatchValue=""
                mask={color[3] === 0}
                aria-label={`${index + 1}: ${hex(color)}`}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      <ControlFlow className={styles.paletteActions}>
        <Button
          slots={{}}
          text={translate("Automatic palette")}
          selected={settings.palette === null}
          disabled={disabled}
          onClick={() => onChange({ palette: null, paletteName: "" })}
        />
        <Button
          slots={{}}
          text={translate(resources.currentLabel)}
          disabled={
            disabled ||
            !resources.currentPalette.length ||
            resources.currentPalette.length > MAX_COLORS ||
            !resources.currentPalette.some((color) => color[3] > 0)
          }
          onClick={() => apply(resources.currentPalette, translate(resources.currentName))}
        />
      </ControlFlow>
    </div>
  );
}
