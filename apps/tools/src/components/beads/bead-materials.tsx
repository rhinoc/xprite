import { useMemo } from "react";

import { useToolWindowShade } from "$/components/shared/window-shade";
import type { BeadToolManager, BeadToolSnapshot } from "$/managers/beads/bead-tool-manager";
import { useBeadText } from "$/managers/locale/tool-language";
import {
  Panel,
  PanelVariant,
  ContentLayout,
  ContentPadding,
  Text,
  TextVariant,
  Button,
  ButtonAppearance,
} from "@xprite/ui";

import styles from "$/components/beads/beads.module.css";

/** Compact colour list: swatch, code and count; clicking a colour highlights its cells. */
export function BeadMaterials({
  manager,
  state,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
}) {
  const shadeMaterials = useToolWindowShade("materials");
  const text = useBeadText();
  const grid = state.grid;
  const busy = state.loading || state.pending || state.downloading;
  const colors = useMemo(
    () =>
      [...(grid?.usage ?? [])].sort(
        (a, b) =>
          b.quantity - a.quantity ||
          a.color.code.localeCompare(b.color.code, "en", { numeric: true }),
      ),
    [grid],
  );
  return (
    <Panel
      {...shadeMaterials}
      variant={PanelVariant.Utility}
      emphasized
      scrollable
      title={text("beads.materials")}
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      className={styles.materials}
    >
      {grid && (
        <>
          <Text variant={TextVariant.Reading} wrap>
            {text("beads.summary", {
              count: grid.total,
              colors: grid.usage.length,
              boards: state.boardCount,
            })}
          </Text>
          <ul className={styles.colors}>
            {colors.map(({ color, quantity }) => (
              <li key={color.code} className={styles.color}>
                <Button
                  appearance={ButtonAppearance.Quiet}
                  text={color.code}
                  aria-label={text("beads.materials.highlight", { code: color.code })}
                  aria-pressed={state.highlight === color.code}
                  selected={state.highlight === color.code}
                  disabled={busy}
                  onClick={() => manager.highlightColor(color.code)}
                  slots={{
                    leading: (
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: `rgb(${color.rgb.join(",")})` }}
                      />
                    ),
                  }}
                />
                <Text variant={TextVariant.Reading}>{String(quantity)}</Text>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
