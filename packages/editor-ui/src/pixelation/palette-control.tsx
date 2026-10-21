import { PalettePresetPopup } from "$/palette";
import type { PaletteBrowserChoice, PaletteTranslate } from "$/palette/model";
import type { Rgba } from "@xprite/editor-core/base";
import type { PixelationSettings } from "@xprite/editor-core/import-export";
import { Button, ButtonVariant, ScrollArea } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";

import styles from "$/pixelation/pixelation.module.css";
const MAX_COLORS = 256;
const SWATCH_SIZE = { width: 10, height: 10 };
export interface PixelationPaletteResources {
  choices: readonly PaletteBrowserChoice[];
  previewPalette: readonly Rgba[];
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  refresh(): void;
}
/**
 * The swatches of the palette in use, with the preset menu at the top right. The menu's first item,
 * Automatic, goes back to the palette picked from the image; it is checked until a preset is loaded,
 * then the loaded preset is.
 */
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
  const rgba = (color: Rgba) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
  const hex = (color: Rgba) =>
    `#${color
      .slice(0, 3)
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  return (
    <div className={styles.paletteControl}>
      {colors.length ? (
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
      ) : (
        <span className={styles.paletteScroll} />
      )}
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
        onLoad={(palette, choice) =>
          onChange({ palette, paletteName: choice.name, reduceColors: true })
        }
        automatic={{
          label: translate("Automatic"),
          active: settings.palette === null,
          onSelect: () => onChange({ palette: null, paletteName: "" }),
        }}
      />
    </div>
  );
}
