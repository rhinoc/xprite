import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useToolTranslation } from "$/managers/locale/tool-language";
import type { ToolViewport } from "$/managers/preview/tool-viewport";
import { CanvasSurface, PanSurface, type CanvasPixelSource } from "@xprite/ui";
import { UiPart, useUiChecker } from "@xprite/ui/assets";
import {
  observeElementSize,
  clientPoint,
  clientToLocal,
  clientDeltaToLocal,
} from "@xprite/ui/utils";

import styles from "$/components/shared/canvas-preview.module.css";

const PAN_BUTTONS = [1];
const LIGHT_BUTTON = 0;

/**
 * The relighting preview: same navigation model as `ToolCanvasPreview`, but the primary
 * pointer moves the light instead of panning. Middle button pans, wheel/pinch zooms.
 */
export function ToolLightPreview({
  navigation,
  identity,
  pixels,
  label,
  light,
  onLightMove,
  guide,
}: {
  navigation: ToolViewport;
  identity: number;
  pixels: CanvasPixelSource;
  label: string;
  /** Light position in document pixels; rendered as a marker on the canvas. */
  light: { x: number; y: number };
  onLightMove(point: { x: number; y: number }): void;
  /** Falloff circle diameter in document pixels; 0 hides the ring. */
  guide?: number;
}) {
  const t = useToolTranslation();
  const checker = useUiChecker();
  const [, setSize] = useState({ width: 1, height: 1 });
  const [pinching, setPinching] = useState(false);
  const view = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  useEffect(() => {
    navigation.setDocument(identity, { width: pixels.width, height: pixels.height });
  }, [navigation, identity, pixels.width, pixels.height]);
  useEffect(() => {
    if (stage.current)
      return observeElementSize(stage.current, (size) => {
        setSize(size);
        navigation.setSize(size);
      });
  }, [navigation]);
  const documentPoint = (event: {
    clientX: number;
    clientY: number;
    currentTarget: EventTarget;
  }) => {
    const point = clientToLocal(event.currentTarget as HTMLElement, clientPoint(event));
    return {
      x: Math.min(pixels.width, Math.max(0, (point.x - view.origin.x) / view.zoom)),
      y: Math.min(pixels.height, Math.max(0, (point.y - view.origin.y) / view.zoom)),
    };
  };
  return (
    <div ref={stage} className={styles.stage}>
      <PanSurface
        className={styles.navigation}
        pan={view.pan}
        onPan={navigation.pan}
        preserveChildFocus
        panButtons={PAN_BUTTONS}
        onPinchStart={(gesture) => {
          setPinching(true);
          navigation.startPinch(gesture);
        }}
        onPinch={navigation.movePinch}
        onPinchEnd={() => {
          setPinching(false);
          return navigation.finishPinch();
        }}
        onDoubleClick={navigation.fit}
        onWheelEvent={(event, node) => {
          if (event.defaultPrevented || (!event.deltaX && !event.deltaY)) return;
          event.preventDefault();
          navigation.wheel(
            event,
            clientDeltaToLocal(node, { x: event.deltaX, y: event.deltaY }),
            clientToLocal(node, clientPoint(event)),
          );
        }}
        tabIndex={0}
        aria-label={t(label)}
        onPointerDown={(event) => {
          if (event.button !== LIGHT_BUTTON || event.defaultPrevented) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = event.pointerId;
          onLightMove(documentPoint(event));
        }}
        onPointerMove={(event) => {
          if (dragging.current !== event.pointerId) return;
          onLightMove(documentPoint(event));
        }}
        onPointerUp={(event) => {
          if (dragging.current === event.pointerId) dragging.current = null;
        }}
        onPointerCancel={(event) => {
          if (dragging.current === event.pointerId) dragging.current = null;
        }}
        onLostPointerCapture={(event) => {
          if (dragging.current === event.pointerId) dragging.current = null;
        }}
      >
        <CanvasSurface
          bounds={{ x: 0, y: 0, width: pixels.width, height: pixels.height }}
          className={styles.canvas}
          style={{
            left: view.origin.x,
            top: view.origin.y,
            width: pixels.width * view.zoom,
            height: pixels.height * view.zoom,
          }}
          pixels={pixels}
          checker={checker}
          aria-label={t(label)}
        />
        {!pinching && (
          <div className={styles.lightGuide} aria-hidden="true">
            {guide ? (
              <span
                className={styles.lightRing}
                style={{
                  left: view.origin.x + light.x * view.zoom,
                  top: view.origin.y + light.y * view.zoom,
                  width: guide * view.zoom,
                  height: guide * view.zoom,
                }}
              />
            ) : null}
            <span
              className={styles.lightDot}
              style={{
                left: view.origin.x + light.x * view.zoom,
                top: view.origin.y + light.y * view.zoom,
              }}
            />
          </div>
        )}
        <UiPart
          part="editor_normal"
          scale={2}
          drawCenter={false}
          className={styles.stageFrame}
          aria-hidden="true"
        />
      </PanSurface>
    </div>
  );
}
