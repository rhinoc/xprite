import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";

import { useToolTranslation } from "$/managers/locale/tool-language";
import type { ToolViewport } from "$/managers/preview/tool-viewport";
import { CanvasSurface, PanSurface, type CanvasPixelSource } from "@xprite/ui";
import { UiPart, useUiChecker } from "@xprite/ui/assets";
import {
  observeElementSize,
  clientPoint,
  clientToLocal,
  clientDeltaToLocal,
  PointerDragActivation,
} from "@xprite/ui/utils";

import styles from "$/components/shared/canvas-preview.module.css";

const PAN_BUTTONS = [0, 1];
const SELECT_BUTTON = 0;
export function ToolCanvasPreview({
  navigation,
  identity,
  pixels,
  label,
  navigationLabel = label,
  onKeyDown,
  onPixelSelect,
  overlay,
}: {
  navigation: ToolViewport;
  identity: number;
  pixels: CanvasPixelSource;
  label: string;
  navigationLabel?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onPixelSelect?: (point: { x: number; y: number }) => void;
  overlay?: (view: ReturnType<ToolViewport["getSnapshot"]>) => ReactNode;
}) {
  const t = useToolTranslation();

  const checker = useUiChecker();
  const view = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const stage = useRef<HTMLDivElement>(null);
  const selection = useRef<{ pointer: number; activation: PointerDragActivation } | null>(null);
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
        aria-label={t(navigationLabel)}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          selection.current =
            onPixelSelect && event.isPrimary && event.button === SELECT_BUTTON
              ? { pointer: event.pointerId, activation: new PointerDragActivation(event) }
              : null;
        }}
        onPointerMove={(event) => {
          if (selection.current?.pointer === event.pointerId)
            selection.current.activation.update(event);
        }}
        onPointerUp={(event) => {
          const active = selection.current;
          selection.current = null;
          if (!active || active.pointer !== event.pointerId || active.activation.update(event))
            return;
          const point = clientToLocal(event.currentTarget, clientPoint(event));
          onPixelSelect?.({
            x: (point.x - view.origin.x) / view.zoom,
            y: (point.y - view.origin.y) / view.zoom,
          });
        }}
        onPointerCancel={() => {
          selection.current = null;
        }}
        onLostPointerCapture={() => {
          selection.current = null;
        }}
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
          aria-label={t(label)}
        />
        {overlay?.(view)}
      </PanSurface>
    </div>
  );
}
