import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  IslandArrangement,
  IslandCamera,
  IslandFilter,
  IslandGround,
  IslandColors,
  IslandPreviewStatus,
  MIN_ISLAND_REPEAT,
  MAX_ISLAND_REPEAT,
  type IslandPreviewManager,
} from "$/managers/animal-crossing/ground/ground-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  Field,
  FieldLayout,
  Text,
  TextVariant,
  Button,
  Checkbox,
  Combobox,
  ControlFlow,
  Input,
  Panel,
} from "@xprite/ui";
import { displayPixelRatio, observeElementSize } from "@xprite/ui/utils";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const SELECT_WIDTH = 94;
const GROUND_SELECT_WIDTH = 80;
const NUMBER_WIDTH = 36;
export function AnimalCrossingGroundView({ manager }: { manager: IslandPreviewManager }) {
  const t = useToolTranslation();

  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const host = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const stop = observeElementSize(node, ({ width, height }) =>
      manager.setSize(width, height, displayPixelRatio(node.ownerDocument.defaultView ?? window)),
    );
    void manager.mount(node);
    return () => {
      stop();
      manager.unmount();
    };
  }, [manager]);
  const unavailable = state.status === IslandPreviewStatus.Unavailable;
  return (
    <div className={styles.groundView}>
      <ControlFlow className={styles.groundToolbar}>
        <Field layout={FieldLayout.Inline} label={t("Ground")}>
          <Combobox
            aria-label={t("Ground preset")}
            pixelWidth={GROUND_SELECT_WIDTH}
            value={state.ground}
            disabled={unavailable}
            options={[
              { value: IslandGround.Green, label: t("Summer grass") },
              { value: IslandGround.Spring, label: t("Spring grass") },
              { value: IslandGround.Autumn, label: t("Autumn grass") },
            ]}
            onValueChange={(ground) => manager.configure({ ground: ground as IslandGround })}
          />
        </Field>
        <Button
          slots={{}}
          text={t("Settings")}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        />
      </ControlFlow>
      <ControlFlow className={styles.cameraToolbar}>
        <Button
          slots={{}}
          text={t("Tilt")}
          disabled={state.status !== IslandPreviewStatus.Ready}
          onClick={() => manager.setCamera(IslandCamera.Overview)}
        />
        <Button
          slots={{}}
          text={t("Top")}
          disabled={state.status !== IslandPreviewStatus.Ready}
          onClick={() => manager.setCamera(IslandCamera.Top)}
        />
        <Button
          slots={{}}
          text={t("Close-up")}
          disabled={state.status !== IslandPreviewStatus.Ready}
          onClick={() => manager.setCamera(IslandCamera.Close)}
        />
      </ControlFlow>
      {state.error && (
        <Panel role="alert">
          <Text variant={TextVariant.Reading} wrap>
            {t(state.error)}
          </Text>
        </Panel>
      )}
      <div
        ref={host}
        className={styles.groundCanvas}
        aria-label={t("Interactive island ground preview")}
        aria-busy={state.status === IslandPreviewStatus.Loading}
      />
      {settingsOpen && (
        <ControlFlow className={styles.groundSettings}>
          <Field layout={FieldLayout.Inline} label={t("Colors")}>
            <Combobox
              aria-label={t("Ground design colors")}
              pixelWidth={SELECT_WIDTH}
              value={state.colors}
              disabled={unavailable}
              options={[
                { value: IslandColors.Original, label: t("Original") },
                { value: IslandColors.Qr, label: t("QR palette") },
              ]}
              onValueChange={(colors) => manager.configure({ colors: colors as IslandColors })}
            />
          </Field>
          <Field layout={FieldLayout.Inline} label={t("Placement")}>
            <Combobox
              aria-label={t("Ground placement")}
              pixelWidth={SELECT_WIDTH}
              value={state.arrangement}
              disabled={unavailable}
              options={[
                { value: IslandArrangement.Nearby, label: t("Nearby 3 × 3") },
                { value: IslandArrangement.Repeat, label: t("Repeat selected") },
              ]}
              onValueChange={(arrangement) =>
                manager.configure({ arrangement: arrangement as IslandArrangement })
              }
            />
          </Field>
          {state.arrangement === IslandArrangement.Repeat && (
            <Field layout={FieldLayout.Inline} label={t("Repeat")}>
              <Input
                aria-label={t("Pattern repeat count")}
                pixelWidth={NUMBER_WIDTH}
                value={String(state.repeatCount)}
                inputMode="numeric"
                min={MIN_ISLAND_REPEAT}
                max={MAX_ISLAND_REPEAT}
                disabled={unavailable}
                onCommit={(value) => manager.configure({ repeatCount: Number(value) })}
              />
            </Field>
          )}
          <Combobox
            aria-label={t("Ground texture filtering")}
            pixelWidth={SELECT_WIDTH}
            value={state.filter}
            disabled={unavailable}
            options={[
              { value: IslandFilter.Smooth, label: t("Smooth") },
              { value: IslandFilter.Pixels, label: t("Pixel sharp") },
            ]}
            onValueChange={(filter) => manager.configure({ filter: filter as IslandFilter })}
          />
          <Checkbox
            label={t("Ground grid")}
            checked={state.grid}
            disabled={unavailable}
            onCheckedChange={(grid) => manager.configure({ grid })}
          />
        </ControlFlow>
      )}
    </div>
  );
}
