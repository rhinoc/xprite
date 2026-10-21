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
  /** The automatic palette: the colours picked from the image at the current settings. */
  previewPalette: readonly Rgba[];
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  refresh(): void;
}
interface PixelationPaletteProps {
  settings: Readonly<PixelationSettings>;
  resources: PixelationPaletteResources;
  disabled: boolean;
  translate: PaletteTranslate;
  onChange(patch: Partial<PixelationSettings>): void;
}
/**
 * The palette preset menu. Its first item, Automatic (with the automatic palette as its strip),
 * goes back to the palette picked from the image; it is checked until a preset is loaded, then the
 * loaded preset is.
 */
export function PixelationPaletteMenu({
  settings,
  resources,
  disabled,
  translate,
  onChange,
}: PixelationPaletteProps) {
  return (
    <PalettePresetPopup
      choices={resources.choices}
      activePalette={settings.palette ?? resources.previewPalette}
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
        colors: resources.previewPalette,
        active: settings.palette === null,
        onSelect: () => onChange({ palette: null, paletteName: "" }),
      }}
    />
  );
}
/** The swatches of the palette in use: the loaded preset, else the automatic palette. */
export function PixelationPaletteSwatches({
  settings,
  resources,
  translate,
}: Pick<PixelationPaletteProps, "settings" | "resources" | "translate">) {
  const colors = settings.palette ?? resources.previewPalette;
  const rgba = (color: Rgba) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
  const hex = (color: Rgba) =>
    `#${color
      .slice(0, 3)
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  if (!colors.length) return null;
  return (
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
  );
}
