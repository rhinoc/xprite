import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import type { Point } from "$/shared/frames/geometry";
import { Icon } from "$/shared/ui/icons";
import { useRenderer, useText } from "$/tools/pixelate/components/context";
import type { MiniToolEditor } from "$/tools/pixelate/managers/editor";
import type { MiniToolScene } from "$/tools/pixelate/managers/ports";
import {
  knobAngle,
  movedPosition,
  normalizeAngle,
  rotateSplit,
  snapAngle,
  splitAxis,
  splitHandle,
  splitSegment,
  type SplitState,
} from "$/tools/pixelate/managers/split-geometry";
import { clientPoint, clientRect, displayPixelRatio, useElementSize } from "@xprite/ui/utils";

import styles from "$/tools/pixelate/components/pixelate.module.css";

/** Keep the rotate knob this far (CSS px) from the handle and from the picture's edge. */
const KNOB_MIN = 40;
const KNOB_EDGE = 20;
const KNOB_SHARE = 0.62;

/** Draw a scene into a canvas `width` × `height` CSS px, redrawing when anything changes. */
function useSceneDrawing(scene: MiniToolScene | null, width: number, height: number) {
  const renderer = useRenderer();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    let live = true;
    void renderer.ready().then(() => live && setFonts((value) => value + 1));
    return () => {
      live = false;
    };
  }, [renderer]);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || !scene || width <= 0) return;
    const frame = requestAnimationFrame(() =>
      renderer.draw(element, scene, (width / scene.composition.size.width) * displayPixelRatio()),
    );
    return () => cancelAnimationFrame(frame);
  }, [renderer, scene, width, height, fonts]);
  return canvas;
}

/** The whole composition fitted into a box, for the export sheet and frame thumbnails. */
export function SceneCanvas({
  scene,
  width,
  height,
  label,
}: {
  scene: MiniToolScene;
  width: number;
  height: number;
  label?: string;
}) {
  const { size } = scene.composition;
  const scale = Math.min(width / size.width, height / size.height);
  const fitted = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  const canvas = useSceneDrawing(scene, fitted.width, fitted.height);
  return (
    <canvas
      ref={canvas}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={fitted}
    />
  );
}

enum Drag {
  Move = "move",
  Rotate = "rotate",
}

interface DragState {
  kind: Drag;
  pointer: number;
  start: Point;
  split: SplitState;
  pivot: Point;
  direction: number;
}

/**
 * The live preview with the split handles: drag the round handle (or the picture) to move the line,
 * drag the knob on the line to rotate it about the handle.
 */
export function SplitPreview({
  editor,
  scene,
  status,
  move,
  rotate,
}: {
  editor: MiniToolEditor;
  scene: MiniToolScene;
  status: string | null;
  /** The move handle shows and the picture can be dragged. */
  move: boolean;
  /** The rotate knob shows. */
  rotate: boolean;
}) {
  const t = useText();
  const stage = useRef<HTMLDivElement>(null);
  const box = useElementSize(stage);
  const { composition, split } = scene;
  const { size, visible } = composition;
  const scale = box.ready ? Math.min(box.width / size.width, box.height / size.height) : 0;
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const canvas = useSceneDrawing(box.ready ? scene : null, width, height);
  const [direction, setDirection] = useState(1);
  const drag = useRef<DragState | null>(null);
  const handle = splitHandle(split, visible);
  const segment = splitSegment(split, visible);
  const half = segment
    ? (Math.hypot(segment[0].x - segment[1].x, segment[0].y - segment[1].y) / 2) * scale
    : 0;
  const knobDistance = Math.max(
    Math.min(half * KNOB_SHARE, half - KNOB_EDGE),
    Math.min(KNOB_MIN, half),
  );
  const axis = splitAxis(split.angle);
  const knob = {
    x: handle.x * scale + axis.x * knobDistance * direction,
    y: handle.y * scale + axis.y * knobDistance * direction,
  };
  const local = (event: PointerEvent<HTMLElement>): Point | null => {
    const rect = clientRect(stage.current?.querySelector("canvas"));
    if (!rect || scale <= 0) return null;
    const point = clientPoint(event);
    return { x: (point.x - rect.left) / scale, y: (point.y - rect.top) / scale };
  };
  const begin = (kind: Drag) => (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || drag.current) return;
    const start = local(event);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    editor.beginGesture();
    drag.current = { kind, pointer: event.pointerId, start, split, pivot: handle, direction };
  };
  const onMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    event.stopPropagation();
    const point = local(event);
    if (!point) return;
    if (state.kind === Drag.Move) {
      const delta = { x: point.x - state.start.x, y: point.y - state.start.y };
      editor.previewSplit({ position: movedPosition(state.split, delta, visible) });
      return;
    }
    const raw = normalizeAngle(knobAngle(state.pivot, point, state.direction));
    const from = raw.flipped ? { ...state.split, swapped: !state.split.swapped } : state.split;
    const next = rotateSplit(from, snapAngle(raw.angle), state.pivot, visible);
    setDirection(raw.flipped ? -state.direction : state.direction);
    editor.previewSplit({ angle: next.angle, position: next.position, swapped: next.swapped });
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    editor.endGesture();
  };
  const dragging = { onPointerMove: onMove, onPointerUp: end, onPointerCancel: end };
  return (
    <div ref={stage} className={styles.stage}>
      <div
        className={styles.preview}
        style={{ width, height }}
        data-split-angle={split.angle}
        data-split-position={split.position.toFixed(3)}
        data-split-swapped={split.swapped ? "" : undefined}
        {...(move ? { onPointerDown: begin(Drag.Move), ...dragging } : {})}
      >
        <canvas ref={canvas} role="img" aria-label={t("canvas.preview")} />
        {move && scale > 0 && (
          <div className={styles.overlay}>
            <div
              className={styles.handle}
              role="slider"
              aria-label={t("canvas.move")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split.position * 100)}
              data-split-handle=""
              style={{ left: handle.x * scale, top: handle.y * scale }}
              onPointerDown={begin(Drag.Move)}
              {...dragging}
            >
              <span>
                <Icon name="arrows" rotate={-split.angle} />
              </span>
            </div>
            {rotate && half > KNOB_EDGE + 10 && (
              <div
                className={styles.knob}
                role="slider"
                aria-label={t("canvas.rotate")}
                aria-valuemin={-90}
                aria-valuemax={90}
                aria-valuenow={split.angle}
                data-split-knob=""
                style={{ left: knob.x, top: knob.y }}
                onPointerDown={begin(Drag.Rotate)}
                {...dragging}
              >
                <span>
                  <Icon name="rotate" />
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {status && (
        <span className={styles.status} role="status">
          {status}
        </span>
      )}
    </div>
  );
}
