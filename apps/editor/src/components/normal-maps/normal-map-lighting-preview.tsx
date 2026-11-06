import { useState } from "react";

import { EditorDialog } from "$/components/dialogs/overlay";
import { NormalMapError } from "$/components/normal-maps/normal-map-error";
import { NormalMapImage } from "$/components/normal-maps/normal-map-image";
import { NormalMapLightingSettings } from "$/components/normal-maps/normal-map-lighting-settings";
import { tUi } from "$/i18n";
import type { NormalMapManager } from "$/managers/normal-maps/normal-map-manager";
import { Button, Tooltip } from "@xprite/ui";

import styles from "$/components/normal-maps/normal-maps.module.css";

const PREVIEW_BOUNDS = { x: 20, y: 80, width: 680, height: 480 };
const PREVIEW_MINIMUM = { width: 240, height: 180 };
const SETTINGS_BUTTON = { right: 56, top: 4, width: 26, height: 26 };
export function NormalMapLightingPreview({ manager }: { manager: NormalMapManager }) {
  const [settings, setSettings] = useState(false);
  const [follow, setFollow] = useState(true);
  return (
    <>
      <EditorDialog
        open
        title={tUi("normal.lighting.title")}
        onOpenChange={(open) => {
          if (!open) manager.closeLighting();
        }}
        defaultBounds={PREVIEW_BOUNDS}
        minSize={PREVIEW_MINIMUM}
        centerOnOpen
        resizable
        constrainToViewport
        autoFocus={false}
        titlebarActions={({ bounds }) => (
          <Tooltip text={tUi("normal.light.settings")}>
            <Button
              bounds={{
                x: bounds.x + bounds.width - SETTINGS_BUTTON.right,
                y: bounds.y + SETTINGS_BUTTON.top,
                width: SETTINGS_BUTTON.width,
                height: SETTINGS_BUTTON.height,
              }}
              relativeTo={bounds}
              icon="timeline_gear"
              selectedIcon="timeline_gear_active"
              selected={settings}
              insetContent={false}
              aria-label={tUi("normal.light.settings")}
              aria-expanded={settings}
              part="window_button_normal"
              hotPart="window_button_hot"
              pushedPart="window_button_selected"
              onClick={() => setSettings((value) => !value)}
            />
          </Tooltip>
        )}
      >
        <div className={styles.lightPanel}>
          <NormalMapImage
            fill
            pixels={manager.lightingScene?.source ?? null}
            lighting={manager.lightingScene}
            label={tUi("normal.lighting.canvas")}
            followLight={follow}
          />
        </div>
      </EditorDialog>
      <NormalMapError error={manager.error} />
      {settings && (
        <NormalMapLightingSettings
          manager={manager}
          follow={follow}
          setFollow={setFollow}
          onClose={() => setSettings(false)}
        />
      )}
    </>
  );
}
