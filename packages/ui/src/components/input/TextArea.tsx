import {
  forwardRef,
  useCallback,
  useId,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TextareaHTMLAttributes,
} from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import {
  layoutSize,
  computedStyle,
  scrollSize,
  scrollPosition,
  setScrollPosition,
  observeResize,
} from "$/base/utils/dom-geometry";
import { useFieldControl } from "$/components/field/Field";
import { Scrollbar } from "$/components/scrollbar/Scrollbar";
import type { ScrollbarVariant } from "$/components/scrollbar/types";

import styles from "$/components/input/text-area.module.css";

const ARTWORK_SCALE = 2;
const OVERFLOW_TOLERANCE = 1;
const RESIZE_HANDLE_SIZE = 16;
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const INITIAL_METRICS = {
  width: 0,
  height: 0,
  resizable: false,
  contentWidth: 0,
  contentHeight: 0,
  left: 0,
  top: 0,
  horizontal: false,
  vertical: false,
};

export enum TextAreaPresentation {
  Plain = "plain",
  Code = "code",
}
export enum TextAreaResize {
  None = "none",
  Vertical = "vertical",
  Both = "both",
}
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  scrollbarVariant?: ScrollbarVariant;
  presentation?: TextAreaPresentation;
  resize?: TextAreaResize;
  height?: number;
  padding?: number;
}

/** Native editing and selection with themed scrollbars synchronized to the textarea. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    className,
    style,
    onInput,
    onScroll,
    scrollbarVariant,
    presentation = TextAreaPresentation.Plain,
    resize = TextAreaResize.None,
    height,
    padding,
    ...props
  },
  ref,
) {
  const { definition } = useTheme();
  const fieldAttributes = useFieldControl(props);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const generatedId = useId();
  const id = fieldAttributes.id ?? generatedId;
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const areaVariant = scrollbarVariant ?? definition.controlParts?.scrollbar?.areaVariant;
  const barSize =
    areaVariant === "regular"
      ? (definition.controlParts?.scrollbar?.arrowExtent ??
        (definition.dimensions.scrollbar_default_size ?? definition.dimensions.scrollbar_size) *
          ARTWORK_SCALE)
      : definition.dimensions.mini_scrollbar_size * ARTWORK_SCALE;
  const setInputRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      input.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const measure = useCallback(() => {
    const node = input.current;
    const frame = root.current;
    if (!node || !frame) return;
    const size = layoutSize(node);
    if (!size.width || !size.height) return;
    const content = scrollSize(node);
    const position = scrollPosition(node);
    const next = {
      width: size.width,
      height: size.height,
      resizable: computedStyle(frame).resize !== "none",
      contentWidth: content.width,
      contentHeight: content.height,
      left: position.x,
      top: position.y,
      horizontal: content.width > size.width + OVERFLOW_TOLERANCE,
      vertical: content.height > size.height + OVERFLOW_TOLERANCE,
    };
    setMetrics((current) =>
      Object.keys(next).every(
        (key) => current[key as keyof typeof next] === next[key as keyof typeof next],
      )
        ? current
        : next,
    );
  }, []);
  useClientLayoutEffect(() => {
    const node = input.current;
    const frame = root.current;
    if (!node || !frame) return;
    const stop = observeResize([node, frame], measure);
    const fonts = node.ownerDocument.fonts;
    fonts.addEventListener("loadingdone", measure);
    return () => {
      stop();
      fonts.removeEventListener("loadingdone", measure);
    };
  }, [measure]);
  useClientLayoutEffect(measure, [
    measure,
    props.value,
    props.defaultValue,
    props.rows,
    props.cols,
    props.wrap,
    className,
    style,
    definition,
  ]);
  const verticalSize = metrics.vertical ? barSize : 0;
  const horizontalSize = metrics.horizontal ? barSize : 0;
  const resizeSize = metrics.resizable ? RESIZE_HANDLE_SIZE : 0;
  const bottomGutter = Math.max(horizontalSize, resizeSize);
  const rightGutter = Math.max(verticalSize, resizeSize);
  const verticalExtent = Math.max(0, metrics.height - bottomGutter);
  const horizontalExtent = Math.max(0, metrics.width - rightGutter);
  const scroll = (position: { x?: number; y?: number }) => {
    if (!input.current) return;
    setScrollPosition(input.current, position);
    measure();
  };
  return (
    <div
      ref={root}
      data-slot="text-area"
      data-disabled={props.disabled || undefined}
      data-invalid={fieldAttributes["aria-invalid"] || undefined}
      data-presentation={presentation}
      className={cn(styles.root, className)}
      style={
        {
          "--ui-textarea-scrollbar-width": `${verticalSize}px`,
          "--ui-textarea-scrollbar-height": `${horizontalSize}px`,
          "--ui-textarea-resize-size": `${resizeSize}px`,
          "--ui-textarea-padding": padding === undefined ? undefined : `${padding}px`,
          height,
          minHeight: height,
          resize,
          ...style,
        } as CSSProperties
      }
    >
      <textarea
        {...props}
        {...fieldAttributes}
        ref={setInputRef}
        id={id}
        className={styles.native}
        onInput={(event) => {
          onInput?.(event);
          measure();
        }}
        onScroll={(event) => {
          onScroll?.(event);
          measure();
        }}
      />
      {metrics.vertical && verticalExtent > 0 && (
        <Scrollbar
          variant={areaVariant ?? "mini"}
          aria-label={props["aria-label"]}
          aria-controls={id}
          bounds={{
            x: metrics.width - barSize,
            y: 0,
            width: barSize,
            height: verticalExtent,
          }}
          contentSize={metrics.contentHeight - bottomGutter}
          visibleSize={verticalExtent}
          value={metrics.top}
          onValueChange={(value) => scroll({ y: value })}
          onClick={(event) => event.preventDefault()}
        />
      )}
      {metrics.horizontal && horizontalExtent > 0 && (
        <Scrollbar
          variant={areaVariant ?? "transparent"}
          aria-label={props["aria-label"]}
          aria-controls={id}
          orientation="horizontal"
          bounds={{
            x: 0,
            y: metrics.height - barSize,
            width: horizontalExtent,
            height: barSize,
          }}
          contentSize={metrics.contentWidth - rightGutter}
          visibleSize={horizontalExtent}
          value={metrics.left}
          onValueChange={(value) => scroll({ x: value })}
          onClick={(event) => event.preventDefault()}
        />
      )}
    </div>
  );
});
