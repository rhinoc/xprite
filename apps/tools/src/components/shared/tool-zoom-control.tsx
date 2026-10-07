import { useSyncExternalStore } from "react";

import type { ToolViewport } from "$/managers/preview/tool-viewport";
import { Combobox, Field, FieldLayout } from "@xprite/ui";

const FIT_ZOOM = 0;
const PRESET_ZOOMS = [1, 2, 4];
const PERCENT = 100;
const ZOOM_WIDTH = 72;

export function ToolZoomControl({ navigation }: { navigation: ToolViewport }) {
  const view = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const value = view.fit ? FIT_ZOOM : view.zoom;
  const choices = [FIT_ZOOM, ...PRESET_ZOOMS];
  if (!choices.includes(value)) choices.push(value);
  return (
    <Field label="Zoom:" layout={FieldLayout.Inline}>
      <Combobox
        pixelWidth={ZOOM_WIDTH}
        value={String(value)}
        aria-label="Preview zoom"
        onValueChange={(next) =>
          Number(next) === FIT_ZOOM ? navigation.fit() : navigation.setZoom(Number(next))
        }
        options={choices.map((zoom) => ({
          value: String(zoom),
          label: zoom === FIT_ZOOM ? "Fit" : `${Math.round(zoom * PERCENT)}%`,
          disabled: zoom !== FIT_ZOOM && !navigation.canZoom(zoom),
        }))}
      />
    </Field>
  );
}
