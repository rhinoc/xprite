import { useMemo, useState } from "react";

import {
  BeadMaterialSort,
  type BeadToolManager,
  type BeadToolSnapshot,
} from "$/managers/beads/bead-tool-manager";
import { useBeadText } from "$/managers/locale/tool-language";
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
  const text = useBeadText();
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
      title={text("beads.materials")}
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      className={styles.materials}
    >
      {grid && (
        <>
          <Text variant={TextVariant.Reading} wrap>
            {text("beads.materials.summary", {
              width: grid.width,
              height: grid.height,
              beads: grid.total,
              colors: grid.usage.length,
              boards: state.boardCount,
            })}
          </Text>
          <ControlFlow className={styles.materialControls}>
            <Input
              pixelWidth={SEARCH_WIDTH}
              aria-label={text("beads.materials.search.label")}
              placeholder={text("beads.materials.search")}
              value={query}
              onValueChange={setQuery}
            />
            <Combobox
              pixelWidth={SORT_WIDTH}
              aria-label={text("beads.materials.sort")}
              value={sort}
              options={[
                {
                  value: BeadMaterialSort.Quantity,
                  label: text("beads.materials.quantity"),
                },
                {
                  value: BeadMaterialSort.Code,
                  label: text("beads.materials.code"),
                },
              ]}
              onValueChange={(value) => setSort(value as BeadMaterialSort)}
            />
          </ControlFlow>
          <ControlFlow className={styles.materialControls}>
            <Button
              text={text("beads.materials.show.all")}
              disabled={busy || !state.highlight}
              onClick={() => manager.highlightColor(null)}
            />
            <Button
              text={text("beads.materials.restore.all")}
              disabled={busy || !state.excludedColors.length}
              onClick={manager.restoreAllColors}
            />
          </ControlFlow>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <Text variant={TextVariant.Reading}>{text("beads.materials.code")}</Text>
                </th>
                <th>
                  <Text variant={TextVariant.Reading}>{text("beads.materials.quantity")}</Text>
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
                      aria-label={text("beads.materials.highlight", {
                        code: color.code,
                      })}
                      aria-pressed={state.highlight === color.code}
                      selected={state.highlight === color.code}
                      disabled={busy}
                      onClick={() => manager.highlightColor(color.code)}
                      slots={{
                        leading: (
                          <span
                            className={styles.swatch}
                            style={{
                              backgroundColor: `rgb(${color.rgb.join(",")})`,
                            }}
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
                      text={text("beads.materials.exclude")}
                      aria-label={text("beads.materials.exclude.color", {
                        code: color.code,
                      })}
                      disabled={busy || grid.usage.length <= 1}
                      onClick={() => manager.excludeColor(color.code)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!colors.length && (
            <Text variant={TextVariant.Reading}>{text("beads.materials.none")}</Text>
          )}
          {!!state.excludedColors.length && (
            <>
              <Text variant={TextVariant.Reading}>{text("beads.materials.excluded")}</Text>
              <ControlFlow className={styles.materialControls}>
                {state.excludedColors.map((color) => (
                  <Button
                    key={color.code}
                    text={color.code}
                    aria-label={text("beads.materials.restore.color", {
                      code: color.code,
                    })}
                    disabled={busy}
                    onClick={() => manager.restoreColor(color.code)}
                  />
                ))}
              </ControlFlow>
            </>
          )}
          <Text variant={TextVariant.Reading} wrap>
            {text("beads.materials.hint")}
          </Text>
        </>
      )}
    </Panel>
  );
}
