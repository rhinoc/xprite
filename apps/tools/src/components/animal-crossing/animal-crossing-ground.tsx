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
import {
  Field,
  FieldLayout,
  Text,
  TextVariant,
  TextTone,
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
        <Field layout={FieldLayout.Inline} label="Ground">
          <Combobox
            aria-label="Ground preset"
            pixelWidth={GROUND_SELECT_WIDTH}
            value={state.ground}
            disabled={unavailable}
            options={[
              { value: IslandGround.Green, label: "Summer grass" },
              { value: IslandGround.Spring, label: "Spring grass" },
              { value: IslandGround.Autumn, label: "Autumn grass" },
            ]}
            onValueChange={(ground) => manager.configure({ ground: ground as IslandGround })}
          />
        </Field>
        <Button
          slots={{}}
          text="Settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        />
      </ControlFlow>
      <ControlFlow className={styles.cameraToolbar}>
        <Button
          slots={{}}
          text="Tilt"
          disabled={state.status !== IslandPreviewStatus.Ready}
          onClick={() => manager.setCamera(IslandCamera.Overview)}
        />
        <Button
          slots={{}}
          text="Top"
          disabled={state.status !== IslandPreviewStatus.Ready}
          onClick={() => manager.setCamera(IslandCamera.Top)}
        />
        <Button
          slots={{}}
          text="Close"
          disabled={state.status !== IslandPreviewStatus.Ready}
          onClick={() => manager.setCamera(IslandCamera.Close)}
        />
      </ControlFlow>
      {state.error && (
        <Panel role="alert">
          <Text variant={TextVariant.Reading} wrap>
            {state.error}
          </Text>
        </Panel>
      )}
      <div
        ref={host}
        className={styles.groundCanvas}
        aria-label="Interactive island ground preview"
        aria-busy={state.status === IslandPreviewStatus.Loading}
      />
      {settingsOpen && (
        <ControlFlow className={styles.groundSettings}>
          <Field layout={FieldLayout.Inline} label="Colors">
            <Combobox
              aria-label="Ground design colors"
              pixelWidth={SELECT_WIDTH}
              value={state.colors}
              disabled={unavailable}
              options={[
                { value: IslandColors.Original, label: "Original" },
                { value: IslandColors.Qr, label: "QR palette" },
              ]}
              onValueChange={(colors) => manager.configure({ colors: colors as IslandColors })}
            />
          </Field>
          <Field layout={FieldLayout.Inline} label="Placement">
            <Combobox
              aria-label="Ground placement"
              pixelWidth={SELECT_WIDTH}
              value={state.arrangement}
              disabled={unavailable}
              options={[
                { value: IslandArrangement.Nearby, label: "Nearby 3 × 3" },
                { value: IslandArrangement.Repeat, label: "Repeat selected" },
              ]}
              onValueChange={(arrangement) =>
                manager.configure({ arrangement: arrangement as IslandArrangement })
              }
            />
          </Field>
          {state.arrangement === IslandArrangement.Repeat && (
            <Field layout={FieldLayout.Inline} label="Repeat">
              <Input
                aria-label="Pattern repeat count"
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
            aria-label="Ground texture filtering"
            pixelWidth={SELECT_WIDTH}
            value={state.filter}
            disabled={unavailable}
            options={[
              { value: IslandFilter.Smooth, label: "Smooth" },
              { value: IslandFilter.Pixels, label: "Pixel sharp" },
            ]}
            onValueChange={(filter) => manager.configure({ filter: filter as IslandFilter })}
          />
          <Checkbox
            label="Ground grid"
            checked={state.grid}
            disabled={unavailable}
            onCheckedChange={(grid) => manager.configure({ grid })}
          />
        </ControlFlow>
      )}
      <div className={styles.groundNote}>
        <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
          Drag to tilt; scroll or pinch to zoom. Transparent pixels reveal the grass.
        </Text>
      </div>
    </div>
  );
}
