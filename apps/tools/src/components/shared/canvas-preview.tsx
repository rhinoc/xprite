import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";

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

const PAN_BUTTONS = [0, 1];
export function ToolCanvasPreview({
  navigation,
  identity,
  pixels,
  label,
  navigationLabel = label,
  onKeyDown,
  overlay,
}: {
  navigation: ToolViewport;
  identity: number;
  pixels: CanvasPixelSource;
  label: string;
  navigationLabel?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  overlay?: (view: ReturnType<ToolViewport["getSnapshot"]>) => ReactNode;
}) {
  const checker = useUiChecker();
  const view = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    navigation.setDocument(identity, { width: pixels.width, height: pixels.height });
  }, [navigation, identity, pixels.width, pixels.height]);
  useEffect(() => {
    if (stage.current) return observeElementSize(stage.current, (size) => navigation.setSize(size));
  }, [navigation]);
  return (
    <div ref={stage} className={styles.stage}>
      <PanSurface
        className={styles.navigation}
        pan={view.pan}
        onPan={navigation.pan}
        handTool
        panButtons={PAN_BUTTONS}
        onPinchStart={navigation.startPinch}
        onPinch={navigation.movePinch}
        onPinchEnd={navigation.finishPinch}
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
        aria-label={navigationLabel}
        onKeyDown={onKeyDown}
      >
        <UiPart
          part="editor_normal"
          scale={2}
          drawCenter={false}
          className={styles.stageFrame}
          aria-hidden="true"
        />
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
          aria-label={label}
        />
        {overlay?.(view)}
      </PanSurface>
    </div>
  );
}
