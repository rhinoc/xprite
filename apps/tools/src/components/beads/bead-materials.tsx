import type { BeadToolSnapshot } from "$/managers/beads/bead-tool-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { Panel, PanelVariant, ContentLayout, ContentPadding, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/beads/beads.module.css";

export function BeadMaterials({ state }: { state: BeadToolSnapshot }) {
  const t = useToolTranslation();
  const grid = state.grid;
  return (
    <Panel
      variant={PanelVariant.Utility}
      emphasized
      collapsible
      scrollable
      title={t("Materials")}
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      className={styles.materials}
    >
      {grid && (
        <>
          <Text
            variant={TextVariant.Reading}
          >{`${grid.width} × ${grid.height} · ${t("Beads")}: ${grid.total} · ${t("Colors")}: ${grid.usage.length}`}</Text>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <Text variant={TextVariant.Reading}>{t("Color code")}</Text>
                </th>
                <th>
                  <Text variant={TextVariant.Reading}>{t("Quantity")}</Text>
                </th>
              </tr>
            </thead>
            <tbody>
              {grid.usage.map(({ color, quantity }) => (
                <tr key={color.code}>
                  <td>
                    <span
                      className={styles.swatch}
                      style={{ backgroundColor: `rgb(${color.rgb.join(",")})` }}
                    />
                    <Text variant={TextVariant.Reading}>{color.code}</Text>
                  </td>
                  <td>
                    <Text variant={TextVariant.Reading}>{String(quantity)}</Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}
