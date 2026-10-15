import { useMemo } from "react";

import { useToolTranslation } from "$/managers/locale/tool-language";
import type { PixelBuffer } from "@xprite/editor-core/base";
import { Text, TextVariant } from "@xprite/ui";

import styles from "$/components/pixelation/pixelation.module.css";

const CHANNELS = 4;
const BYTE = 256;
const MAX_SWATCHES = 512;

/** The distinct opaque-or-not colours of the pixelated result, as a swatch list. */
export function PixelationPalette({ pixels }: { pixels: PixelBuffer }) {
  const t = useToolTranslation();
  const colors = useMemo(() => {
    const seen = new Set<number>();
    const data = pixels.data;
    for (let index = 0; index < data.length; index += CHANNELS) {
      if (data[index + 3] === 0) continue;
      seen.add(
        ((data[index] * BYTE + data[index + 1]) * BYTE + data[index + 2]) * BYTE + data[index + 3],
      );
    }
    return [...seen];
  }, [pixels]);
  return (
    <>
      <Text variant={TextVariant.Reading}>{`${colors.length} ${t("colors")}`}</Text>
      <ul className={styles.swatches} aria-label={t("Palette")}>
        {colors.slice(0, MAX_SWATCHES).map((value) => {
          const a = value % BYTE;
          const b = Math.floor(value / BYTE) % BYTE;
          const g = Math.floor(value / BYTE ** 2) % BYTE;
          const r = Math.floor(value / BYTE ** 3);
          return (
            <li
              key={value}
              className={styles.swatch}
              title={`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`}
              style={{ background: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
            />
          );
        })}
      </ul>
    </>
  );
}
