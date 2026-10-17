import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { ScrollbarStyle, ScrollbarThumb, type CanvasPixelSource } from "@xprite/ui";
import { clientPoint, clientRect } from "@xprite/ui/utils";

import styles from "$/components/dialogs/pixelation-dialog/import-compare.module.css";

const STEP = 5;

function PixelCanvas({
  pixels,
  className,
  style,
}: {
  pixels: CanvasPixelSource;
  className: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0,
    );
  }, [pixels]);
  return <canvas ref={ref} className={className} style={style} />;
}

/** One canvas, two layers: the original on one side of a draggable bar, the result on the other. */
export function ImportCompare({
  original,
  result,
  width,
  height,
  labels,
  comparing = true,
}: {
  original: CanvasPixelSource;
  result: CanvasPixelSource | null;
  width: number;
  height: number;
  /** False shows only the original: no result layer, divider or handle. */
  comparing?: boolean;
  labels: {
    original: string;
    result: string;
    preparing: string;
    slider: string;
  };
}) {
  const [split, setSplit] = useState(50);
  const [hot, setHot] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const aspect = original.width / original.height;
  const stageWidth = Math.max(40, Math.min(width, Math.floor(height * aspect)));
  const stageHeight = Math.max(40, Math.min(height, Math.floor(width / aspect)));
  const move = (event: PointerEvent) => {
    const rect = clientRect(box.current);
    if (!rect || rect.width <= 0) return;
    setSplit(Math.max(0, Math.min(100, ((clientPoint(event).x - rect.left) / rect.width) * 100)));
  };
  const onKey = (event: KeyboardEvent) => {
    const delta = event.key === "ArrowLeft" ? -STEP : event.key === "ArrowRight" ? STEP : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    setSplit((value) => Math.max(0, Math.min(100, value + delta)));
  };
  const left = original;
  const right = result;
  const leftLabel = labels.original;
  const rightLabel = labels.result;
  return (
    <div className={styles.frame} style={{ width, height }}>
      <div
        ref={box}
        className={styles.stage}
        style={{
          width: stageWidth,
          height: stageHeight,
          ...(comparing ? {} : { cursor: "default" }),
        }}
        onPointerDown={(event) => {
          if (!comparing) return;
          dragging.current = true;
          event.preventDefault();
          bar.current?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={(event) => dragging.current && move(event)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {left ? (
          <PixelCanvas pixels={left} className={styles.layer} />
        ) : (
          <div className={styles.waiting}>{labels.preparing}</div>
        )}
        {comparing && right && (
          <PixelCanvas
            pixels={right}
            className={styles.layer}
            style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          />
        )}
        {comparing && (
          <div
            ref={bar}
            className={styles.bar}
            style={{ left: `${split}%` }}
            role="slider"
            tabIndex={0}
            aria-label={labels.slider}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            onKeyDown={onKey}
            onPointerEnter={() => setHot(true)}
            onPointerLeave={() => setHot(false)}
            onFocus={() => setHot(true)}
            onBlur={() => setHot(false)}
          >
            <ScrollbarThumb
              scrollbarStyle={ScrollbarStyle.Classic}
              className={styles.grip}
              hovered={hot}
            />
          </div>
        )}
      </div>
      {/* Anchored to the frame, not the (aspect-fitted, possibly narrow) stage, so they never clip. */}
      {comparing && <span className={`${styles.tag} ${styles.tagLeft}`}>{leftLabel}</span>}
      {comparing && <span className={`${styles.tag} ${styles.tagRight}`}>{rightLabel}</span>}
    </div>
  );
}
