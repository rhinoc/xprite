import { tUiSource } from "$/i18n";
import type { ShortcutDragVector } from "$/managers/shortcuts/shortcut-manager";
import { Button, Slider, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/dialogs/keyboard-shortcuts/keyboard-shortcuts.module.css";

const MIN_DISTANCE = 1;
const MAX_DISTANCE = 100;
const DIRECTION_STEP = Math.PI / 4;
const VECTOR_ZERO_EPSILON = 0.00001;
const DIRECTIONS = [
  { x: -1, y: 1, icon: "canvas_nw", label: "Up Left" },
  { x: 0, y: 1, icon: "canvas_n", label: "Up" },
  { x: 1, y: 1, icon: "canvas_ne", label: "Up Right" },
  { x: -1, y: 0, icon: "canvas_w", label: "Left" },
  null,
  { x: 1, y: 0, icon: "canvas_e", label: "Right" },
  { x: -1, y: -1, icon: "canvas_sw", label: "Down Left" },
  { x: 0, y: -1, icon: "canvas_s", label: "Down" },
  { x: 1, y: -1, icon: "canvas_se", label: "Down Right" },
] as const;

/** Native drag values use an upward Y vector and pixels per value step. */
export function ShortcutDragOptions({
  vector,
  onChange,
}: {
  vector: ShortcutDragVector;
  onChange(vector: ShortcutDragVector): void;
}) {
  const distance = Math.hypot(vector.x, vector.y);
  const angle = Math.atan2(vector.y, vector.x);
  const directionAngle = Math.round(angle / DIRECTION_STEP) * DIRECTION_STEP;
  const update = (nextAngle: number, nextDistance: number) => {
    const x = Math.cos(nextAngle) * nextDistance;
    const y = Math.sin(nextAngle) * nextDistance;
    onChange({
      x: Math.abs(x) < VECTOR_ZERO_EPSILON ? 0 : x,
      y: Math.abs(y) < VECTOR_ZERO_EPSILON ? 0 : y,
    });
  };
  return (
    <div className={styles.dragOptions}>
      <Text variant={TextVariant.Inline}>{tUiSource("Direction:")}</Text>
      <div className={styles.dragDirections} role="group" aria-label={tUiSource("Drag direction")}>
        {DIRECTIONS.map((direction, index) =>
          direction ? (
            <Button
              key={direction.icon}
              icon={direction.icon}
              aria-label={tUiSource(direction.label)}
              aria-pressed={
                Math.cos(directionAngle) * direction.x + Math.sin(directionAngle) * direction.y >
                Math.hypot(direction.x, direction.y) - VECTOR_ZERO_EPSILON
              }
              selected={
                Math.cos(directionAngle) * direction.x + Math.sin(directionAngle) * direction.y >
                Math.hypot(direction.x, direction.y) - VECTOR_ZERO_EPSILON
              }
              pixelSize={{ width: 16, height: 16 }}
              onClick={() =>
                update(
                  Math.atan2(direction.y, direction.x),
                  Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance)),
                )
              }
            />
          ) : (
            <span key={index} aria-hidden="true" />
          ),
        )}
      </div>
      <Text variant={TextVariant.Inline}>{tUiSource("Distance:")}</Text>
      <Slider
        pixelSize={{ width: 128, height: 16 }}
        min={MIN_DISTANCE}
        max={MAX_DISTANCE}
        value={Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, Math.round(distance)))}
        aria-label={tUiSource("Drag distance")}
        onValueChange={(value) => update(angle, value)}
      />
    </div>
  );
}
