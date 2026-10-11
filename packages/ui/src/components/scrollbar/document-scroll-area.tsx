import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useTheme } from "$/base/theme/theme-context";
import { ScrollbarStyle } from "$/base/theme/theme-types";
import { cn } from "$/base/utils/cn";
import {
  observeResize,
  scrollPosition,
  scrollSize,
  scrollWindowTo,
  viewportContentSize,
} from "$/base/utils/dom-geometry";
import { cancelLayoutMeasurement, queueLayoutMeasurement } from "$/base/utils/layout-measurements";
import { installPageFragmentContainment } from "$/base/utils/page-fragment";
import {
  ScrollbarRendering,
  type DocumentScrollAreaProps,
} from "$/components/scrollbar/scroll-area-types";
import { Scrollbar } from "$/components/scrollbar/Scrollbar";

import styles from "$/components/scrollbar/page-scroll-area.module.css";

const ARTWORK_SCALE = 2;
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A themed document scrollbar; browser anchors, page scrolling and fixed elements stay native. */
export const DocumentScrollArea = forwardRef<HTMLDivElement, DocumentScrollAreaProps>(
  function DocumentScrollArea(
    {
      children,
      reserveScrollbarGutter = true,
      documentGutter = false,
      scrollbarRendering = ScrollbarRendering.Skinned,
      scrollbarStyle,
      className,
      style,
      ...props
    }: DocumentScrollAreaProps,
    ref,
  ) {
    const { definition } = useTheme();
    const native = scrollbarRendering === ScrollbarRendering.Browser;
    const root = useRef<HTMLDivElement | null>(null);
    const setRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        root.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    const [metrics, setMetrics] = useState({ height: 0, content: 0, value: 0 });
    const useClassicScrollbar =
      scrollbarStyle === ScrollbarStyle.Classic ||
      (!scrollbarStyle && definition.controlParts?.scrollbar?.areaStyle === ScrollbarStyle.Classic);
    const size = useClassicScrollbar
      ? definition.controlParts!.scrollbar!.arrowExtent
      : definition.dimensions.mini_scrollbar_size * ARTWORK_SCALE;
    useEffect(() => {
      const doc = root.current?.ownerDocument;
      if (doc) installPageFragmentContainment(doc);
    }, []);
    useClientLayoutEffect(() => {
      if (native || !documentGutter || !reserveScrollbarGutter) return;
      const element = root.current?.ownerDocument.documentElement;
      if (!element) return;
      const before = element.style.getPropertyValue("--ui-document-scrollbar-size");
      element.style.setProperty("--ui-document-scrollbar-size", `${size}px`);
      return () => {
        if (before) element.style.setProperty("--ui-document-scrollbar-size", before);
        else element.style.removeProperty("--ui-document-scrollbar-size");
      };
    }, [native, documentGutter, reserveScrollbarGutter, size]);
    useClientLayoutEffect(() => {
      if (native) return;
      const node = root.current;
      const documentHost = node?.ownerDocument;
      const host = documentHost?.defaultView;
      if (!node || !documentHost || !host) return;
      let disposed = false;
      const measure = () => {
        const scroller = documentHost.scrollingElement ?? documentHost.documentElement;
        const next = {
          height: viewportContentSize(host).height,
          content: scrollSize(scroller).height,
          value: scrollPosition(scroller).y,
        };
        setMetrics((old) =>
          old.height === next.height && old.content === next.content && old.value === next.value
            ? old
            : next,
        );
      };
      const schedule = () => queueLayoutMeasurement(host, measure);
      const resize = observeResize([documentHost.body], schedule);
      const mutation = new MutationObserver((records) => {
        if (
          records.some(
            (record) =>
              !(record.target instanceof Element) ||
              !record.target.closest('[data-slot="page-scroll-chrome"]'),
          )
        )
          schedule();
      });
      mutation.observe(documentHost.body, { childList: true, subtree: true, characterData: true });
      host.addEventListener("scroll", schedule, { passive: true });
      host.addEventListener("resize", schedule);
      documentHost.addEventListener("load", schedule, true);
      void documentHost.fonts.ready.then(() => {
        if (!disposed) schedule();
      });
      measure();
      return () => {
        disposed = true;
        resize();
        mutation.disconnect();
        host.removeEventListener("scroll", schedule);
        host.removeEventListener("resize", schedule);
        documentHost.removeEventListener("load", schedule, true);
        cancelLayoutMeasurement(host, measure);
      };
    }, [native]);
    return (
      <div
        {...props}
        ref={setRootRef}
        className={cn(styles.root, className)}
        data-slot="page-scroll-area"
        data-page-scroll-native={native || undefined}
        data-page-scroll-reserve={(native && reserveScrollbarGutter) || undefined}
        data-document-gutter={(documentGutter && reserveScrollbarGutter) || undefined}
        style={
          {
            "--ui-page-scrollbar-size": `${size}px`,
            display: documentGutter ? "contents" : undefined,
            paddingInlineEnd: !native && reserveScrollbarGutter && !documentGutter ? size : 0,
            ...style,
          } as CSSProperties
        }
      >
        {children}
        {!native && metrics.content > metrics.height && metrics.height > 0 && (
          <div data-slot="page-scroll-chrome" className={styles.chrome}>
            <Scrollbar
              scrollbarStyle={
                scrollbarStyle ??
                (useClassicScrollbar ? ScrollbarStyle.Classic : ScrollbarStyle.Compact)
              }
              bounds={{ x: 0, y: 0, width: size, height: metrics.height }}
              visibleSize={metrics.height}
              contentSize={metrics.content}
              value={metrics.value}
              style={{
                position: "fixed",
                inset: "0 0 auto auto",
              }}
              aria-label={props["aria-label"] ?? "Page scroll"}
              onValueChange={(value) => {
                const host = root.current?.ownerDocument.defaultView;
                if (host) scrollWindowTo(host, { y: value });
              }}
            />
          </div>
        )}
      </div>
    );
  },
);
