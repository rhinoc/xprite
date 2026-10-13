import { useMemo, useState } from "react";

import {
  BeadMaterialSort,
  type BeadToolManager,
  type BeadToolSnapshot,
} from "$/managers/beads/bead-tool-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  Panel,
  PanelVariant,
  ContentLayout,
  ContentPadding,
  Text,
  TextVariant,
  Input,
  Combobox,
  Button,
  ButtonAppearance,
  ControlFlow,
} from "@xprite/ui";

import styles from "$/components/beads/beads.module.css";

const SEARCH_WIDTH = 80;
const SORT_WIDTH = 54;

export function BeadMaterials({
  manager,
  state,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
}) {
  const t = useToolTranslation();
  const grid = state.grid;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(BeadMaterialSort.Quantity);
  const busy = state.loading || state.pending || state.downloading;
  const colors = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (grid?.usage ?? [])
      .filter(({ color }) => `${color.code} ${color.name}`.toLowerCase().includes(search))
      .sort((a, b) =>
        sort === BeadMaterialSort.Quantity && a.quantity !== b.quantity
          ? b.quantity - a.quantity
          : a.color.code.localeCompare(b.color.code, "en", { numeric: true }),
      );
  }, [grid, query, sort]);
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
          <Text variant={TextVariant.Reading} wrap>
            {`${grid.width} × ${grid.height} · ${t("Beads")}: ${grid.total} · ${t("Colors")}: ${grid.usage.length} · ${t("Boards")}: ${state.boards.length}`}
          </Text>
          <ControlFlow className={styles.materialControls}>
            <Input
              pixelWidth={SEARCH_WIDTH}
              aria-label={t("Search color codes")}
              placeholder={t("Search colors")}
              value={query}
              onValueChange={setQuery}
            />
            <Combobox
              pixelWidth={SORT_WIDTH}
              aria-label={t("Sort colors")}
              value={sort}
              options={[
                { value: BeadMaterialSort.Quantity, label: t("Quantity") },
                { value: BeadMaterialSort.Code, label: t("Color code") },
              ]}
              onValueChange={(value) => setSort(value as BeadMaterialSort)}
            />
          </ControlFlow>
          <ControlFlow className={styles.materialControls}>
            <Button
              text={t("Show all colors")}
              disabled={busy || !state.highlight}
              onClick={() => manager.highlightColor(null)}
            />
            <Button
              text={t("Restore all colors")}
              disabled={busy || !state.excludedColors.length}
              onClick={manager.restoreAllColors}
            />
          </ControlFlow>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <Text variant={TextVariant.Reading}>{t("Color code")}</Text>
                </th>
                <th>
                  <Text variant={TextVariant.Reading}>{t("Quantity")}</Text>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {colors.map(({ color, quantity }) => (
                <tr key={color.code}>
                  <td>
                    <Button
                      appearance={ButtonAppearance.Quiet}
                      text={color.code}
                      aria-label={`${t("Highlight")}: ${color.code}`}
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
                  </td>
                  <td>
                    <Text variant={TextVariant.Reading}>{String(quantity)}</Text>
                  </td>
                  <td>
                    <Button
                      appearance={ButtonAppearance.Quiet}
                      text={t("Exclude")}
                      aria-label={`${t("Exclude")}: ${color.code}`}
                      disabled={busy || grid.usage.length <= 1}
                      onClick={() => manager.excludeColor(color.code)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!colors.length && <Text variant={TextVariant.Reading}>{t("No matching colors.")}</Text>}
          {!!state.excludedColors.length && (
            <>
              <Text variant={TextVariant.Reading}>{t("Excluded colors")}</Text>
              <ControlFlow className={styles.materialControls}>
                {state.excludedColors.map((color) => (
                  <Button
                    key={color.code}
                    text={color.code}
                    aria-label={`${t("Restore")}: ${color.code}`}
                    disabled={busy}
                    onClick={() => manager.restoreColor(color.code)}
                  />
                ))}
              </ControlFlow>
            </>
          )}
          <Text variant={TextVariant.Reading} wrap>
            {t("Click a color code to highlight its cells. Excluded colors are rematched.")}
          </Text>
        </>
      )}
    </Panel>
  );
}
