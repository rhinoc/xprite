import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Ref,
  type ReactNode,
} from "react";

import {
  generatedUIComponents,
  type GalleryComponentDefinition,
  type GalleryPropSchema,
} from "$/generated-ui-components";
import type { IconClipboard } from "$/managers/ports/icon-clipboard";
import {
  Button,
  ButtonVariant,
  Checkbox,
  Combobox,
  Dialog,
  Divider,
  Input,
  ListBox,
  OverlayContentLayout,
  Panel,
  Scrollbar,
  Toast,
  type ButtonProps,
  type SurfaceBounds,
  useUi,
} from "@xprite/ui";
import { UiIcon, type UiPartName } from "@xprite/ui/assets";
import {
  scrollSize,
  layoutSize,
  scrollPosition,
  setScrollPosition,
  observeResize,
} from "@xprite/ui/utils";

import styles from "$/gallery.module.css";

const GALLERY_CALLBACK_KEY = "$galleryCallback";
const GALLERY_ICON_KEY = "$galleryIcon";
const CALLBACK_PLACEHOLDER = "[Gallery callback]";
const EVENT_LOG_LIMIT = 200;
const DEFAULT_ENUM_VALUE = "__gallery_default__";
const DEFAULT_COMPONENT_SLUG = "button";
const GALLERY_WINDOW_RATIO = 0.8;
const MIN_ICON_GROUP_SIZE = 4;
const OTHER_ICONS_GROUP_TITLE = "Others";
const COPY_NOTICE_DURATION_MS = 1800;
const HEADER_SEARCH_BOUNDS = { x: 0, y: 0, width: 180, height: 28 };
const SECTION_HEADING_HEIGHT = 12;
const ARTWORK_SCALE = 2;
const FILTER_ENTRY_BOUNDS = { x: 0, y: 0, width: 180, height: 28 };
const FORM_CONTROL_HEIGHT = 32;
const MIN_PREVIEW_HEIGHT = 64;
const DEFAULT_PREVIEW_HEIGHT = 96;
const MAX_PREVIEW_HEIGHT = 420;
const SCROLLBAR_THICKNESS = 12;
const SCROLL_MEASUREMENT_EPSILON = 1;
const COMPONENT_NAV_ITEM_HEIGHT = 18;
const COMPONENT_NAV_VERTICAL_INSET = 14;
const COMPONENT_NAV_SCROLLBAR_GUTTER = 14;

const callbackTarget = {
  onOpenChange: "open",
  onExpandedChange: "expanded",
  onCheckedChange: "checked",
  onValueChange: "value",
  onBoundsChange: "bounds",
} as const;

type EditableProps = Record<string, unknown>;

function useGalleryElementSize<ElementType extends HTMLElement>() {
  const ref = useRef<ElementType>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const next = layoutSize(node);
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    return observeResize([node], measure);
  }, []);
  return { ref, ...size };
}

function GallerySectionHeading({ text }: { text: string }) {
  const { ref, width } = useGalleryElementSize<HTMLHeadingElement>();
  return (
    <h2 aria-label={text} className={styles["gallery-section-heading"]} ref={ref}>
      <Divider
        pixelSize={{ width: width / ARTWORK_SCALE, height: SECTION_HEADING_HEIGHT }}
        text={text}
      />
    </h2>
  );
}

function GalleryFormControl({ children }: { children: (bounds: SurfaceBounds) => ReactNode }) {
  const { ref, width } = useGalleryElementSize<HTMLDivElement>();
  return (
    <div className={styles["gallery-themed-control"]} ref={ref}>
      {width > 0 && children({ x: 0, y: 0, width, height: FORM_CONTROL_HEIGHT })}
    </div>
  );
}

interface ScrollMetrics {
  contentSize: number;
  visibleSize: number;
  value: number;
  width: number;
}

interface GalleryScrollRegionProps {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  contentClassName?: string;
  contentRevision?: number;
}

function GalleryScrollRegion({
  ariaLabel,
  children,
  className,
  contentClassName,
  contentRevision = 0,
}: GalleryScrollRegionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    contentSize: 0,
    visibleSize: 0,
    value: 0,
    width: 0,
  });

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    const next = {
      contentSize: scrollSize(content).height,
      visibleSize: layoutSize(content).height,
      value: scrollPosition(content).y,
      width: layoutSize(content).width,
    };
    setMetrics((current) =>
      current.contentSize === next.contentSize &&
      current.visibleSize === next.visibleSize &&
      current.value === next.value &&
      current.width === next.width
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    measure();
    const resizeObserver = observeResize([content], measure);
    const mutationObserver = new MutationObserver(measure);

    mutationObserver.observe(content, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver();
      mutationObserver.disconnect();
    };
  }, [contentRevision, measure]);

  const hasOverflow = metrics.contentSize > metrics.visibleSize + SCROLL_MEASUREMENT_EPSILON;

  return (
    <div className={`${styles["gallery-scroll-region"]} ${className}`}>
      <div
        aria-label={ariaLabel}
        className={[styles["gallery-scroll-content"], contentClassName].filter(Boolean).join(" ")}
        onScroll={measure}
        ref={contentRef}
        role="region"
        tabIndex={0}
      >
        {children}
      </div>
      {hasOverflow && (
        <Scrollbar
          aria-label={`${ariaLabel} scroll`}
          bounds={{
            x: Math.max(0, metrics.width - SCROLLBAR_THICKNESS),
            y: 0,
            width: SCROLLBAR_THICKNESS,
            height: metrics.visibleSize,
          }}
          contentSize={metrics.contentSize}
          onValueChange={(value) => {
            if (!contentRef.current) return;
            setScrollPosition(contentRef.current, { y: value });
            measure();
          }}
          value={metrics.value}
          visibleSize={metrics.visibleSize}
        />
      )}
    </div>
  );
}

function GalleryComponentNavigation({
  components,
  componentSlug,
  onSelect,
}: {
  components: readonly GalleryComponentDefinition[];
  componentSlug: string;
  onSelect: (slug: string) => void;
}) {
  const viewportRef = useRef<HTMLElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const items = useMemo(
    () => [
      { value: "icons", label: "Icons" },
      ...components.map((component) => ({
        value: componentSlugFromName(component.name),
        label: component.name,
      })),
    ],
    [components],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const next = { width: layoutSize(viewport).width, height: layoutSize(viewport).height };
      setViewportSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    const observer = observeResize([viewport], measure);

    return () => observer();
  }, []);

  const listWidth = Math.max(0, viewportSize.width - COMPONENT_NAV_SCROLLBAR_GUTTER);
  const listHeight = Math.max(
    viewportSize.height,
    COMPONENT_NAV_VERTICAL_INSET + items.length * COMPONENT_NAV_ITEM_HEIGHT,
  );
  const selectedValue = items.some((item) => item.value === componentSlug) ? componentSlug : "";

  return (
    <nav aria-label="UI components" className={styles["gallery-component-nav"]} ref={viewportRef}>
      <GalleryScrollRegion
        ariaLabel="UI components"
        className={styles["gallery-component-nav-scroll"]}
        contentRevision={items.length}
      >
        <div style={{ position: "relative", width: listWidth, height: listHeight }}>
          {listWidth > 0 && listHeight > 0 && (
            <ListBox
              aria-label="UI components"
              bounds={{ x: 0, y: 0, width: listWidth, height: listHeight }}
              items={items}
              onValueChange={onSelect}
              value={selectedValue}
            />
          )}
        </div>
      </GalleryScrollRegion>
    </nav>
  );
}

interface PreviewBoundaryProps {
  children: ReactNode;
  resetRevision: number;
}

interface PreviewBoundaryState {
  error: string | null;
}

class PreviewBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
  state: PreviewBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PreviewBoundaryState {
    return { error: error.message };
  }

  componentDidUpdate(previousProps: PreviewBoundaryProps) {
    if (previousProps.resetRevision !== this.props.resetRevision && this.state.error)
      this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <p className={styles["gallery-error"]}>{this.state.error}</p>;
    return this.props.children;
  }
}

function stringify(value: unknown) {
  return JSON.stringify(toEditorValue(value), null, 2) ?? "null";
}

function toEditorValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toEditorValue);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (GALLERY_CALLBACK_KEY in record) return CALLBACK_PLACEHOLDER;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, toEditorValue(child)]),
  );
}

function fromEditorValue(value: unknown, key = "callback"): unknown {
  if (value === CALLBACK_PLACEHOLDER) return { [GALLERY_CALLBACK_KEY]: key };
  if (Array.isArray(value)) return value.map((child) => fromEditorValue(child));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, fromEditorValue(child, childKey)]),
  );
}

function callbackDefaults(definition: GalleryComponentDefinition) {
  return Object.fromEntries(
    definition.props
      .filter((prop) => prop.kind === "callback")
      .map((prop) => [
        prop.name,
        definition.name === "Slider" && prop.name === "paintBackground"
          ? false
          : !prop.hostProp || prop.required,
      ]),
  );
}

function eventSummary(name: string, args: unknown[]) {
  const summary = args
    .map((value) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return String(value);
      if (value === null || value === undefined) return String(value);
      if (Array.isArray(value)) return `[${value.length} items]`;
      if (typeof value === "object") {
        if ("text" in value && typeof value.text === "string") return `text: ${value.text}`;
        if ("x" in value && "y" in value) return `x: ${String(value.x)}, y: ${String(value.y)}`;
        return Object.prototype.toString.call(value);
      }
      return typeof value;
    })
    .join(", ");
  return summary ? `${name}(${summary})` : `${name}()`;
}

function paintSample(context: CanvasRenderingContext2D) {
  context.fillStyle = "#7d929e";
  context.fillRect(0, 0, 96, 64);
  context.fillStyle = "#d3cbbe";
  context.fillRect(8, 8, 24, 24);
  context.fillStyle = "#202528";
  context.fillRect(40, 8, 24, 24);
  context.fillStyle = "#ffebb6";
  context.fillRect(72, 8, 16, 24);
}

function paintSliderBackground(context: CanvasRenderingContext2D, bounds: SurfaceBounds) {
  const gradient = context.createLinearGradient(
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y,
  );
  gradient.addColorStop(0, "#202528");
  gradient.addColorStop(1, "#ffbf69");
  context.fillStyle = gradient;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
}

function CallbackControl({
  schema,
  enabled,
  onChange,
}: {
  schema: GalleryPropSchema;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <GalleryFormControl>
      {(bounds) => (
        <Checkbox
          aria-label={schema.name}
          bounds={bounds}
          checked={enabled}
          label={schema.name}
          mini
          onCheckedChange={onChange}
        />
      )}
    </GalleryFormControl>
  );
}

function JsonControl({
  schema,
  value,
  onChange,
}: {
  schema: GalleryPropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => stringify(value));
  const [invalid, setInvalid] = useState(false);

  return (
    <label className={styles["gallery-field"]}>
      <span className={styles["gallery-field-heading"]}>
        <span>{schema.name}</span>
      </span>
      <textarea
        aria-invalid={invalid}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          try {
            onChange(fromEditorValue(JSON.parse(nextDraft) as unknown));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
        spellCheck={false}
        value={draft}
      />
    </label>
  );
}

function PropControl({
  schema,
  value,
  onChange,
  callbackEnabled,
  onCallbackChange,
}: {
  schema: GalleryPropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  callbackEnabled: boolean;
  onCallbackChange: (value: boolean) => void;
}) {
  if (schema.kind === "callback")
    return (
      <CallbackControl enabled={callbackEnabled} onChange={onCallbackChange} schema={schema} />
    );

  if (schema.kind === "array" || schema.kind === "json" || schema.kind === "node")
    return <JsonControl onChange={onChange} schema={schema} value={value} />;

  if (schema.kind === "boolean")
    return (
      <GalleryFormControl>
        {(bounds) => (
          <Checkbox
            aria-label={schema.name}
            bounds={bounds}
            checked={Boolean(value)}
            label={schema.name}
            mini
            onCheckedChange={onChange}
          />
        )}
      </GalleryFormControl>
    );

  if (schema.kind === "enum")
    return (
      <div className={styles["gallery-field"]}>
        <span className={styles["gallery-field-heading"]}>{schema.name}</span>
        <GalleryFormControl>
          {(bounds) => (
            <Combobox
              aria-label={schema.name}
              bounds={bounds}
              onValueChange={(nextValue) => {
                const option = schema.options?.find((candidate) => String(candidate) === nextValue);
                onChange(nextValue === DEFAULT_ENUM_VALUE ? undefined : (option ?? nextValue));
              }}
              options={[
                ...(!schema.required ? [{ value: DEFAULT_ENUM_VALUE, label: "(default)" }] : []),
                ...(schema.options ?? []).map((option) => ({
                  value: String(option),
                  label: String(option),
                })),
              ]}
              value={value === null || value === undefined ? DEFAULT_ENUM_VALUE : String(value)}
            />
          )}
        </GalleryFormControl>
      </div>
    );

  return (
    <div className={styles["gallery-field"]}>
      <span className={styles["gallery-field-heading"]}>{schema.name}</span>
      <GalleryFormControl>
        {(bounds) => (
          <Input
            aria-label={schema.name}
            bounds={bounds}
            onValueChange={(nextValue) =>
              onChange(schema.kind === "number" ? Number(nextValue) : nextValue)
            }
            size={24}
            type={schema.kind === "number" ? "number" : "text"}
            value={value === null || value === undefined ? "" : String(value)}
          />
        )}
      </GalleryFormControl>
    </div>
  );
}

function GalleryCard({ definition }: { definition: GalleryComponentDefinition }) {
  const [props, setProps] = useState<EditableProps>(() => ({ ...definition.initialProps }));
  const [enabledCallbacks, setEnabledCallbacks] = useState<Record<string, boolean>>(() =>
    callbackDefaults(definition),
  );
  const [events, setEvents] = useState<string[]>([]);
  const [propFilter, setPropFilter] = useState("");
  const [resetRevision, setResetRevision] = useState(0);
  const variantSchema = definition.props.find(
    (prop) => prop.name === "variant" && prop.kind === "enum" && (prop.options?.length ?? 0) > 1,
  );
  const variantOptions = variantSchema?.options ?? [];
  const hasVariants = variantOptions.length > 1;
  const [variantProps, setVariantProps] = useState<Record<string, EditableProps>>({});
  const normalizedPropFilter = propFilter.trim().toLowerCase();
  const visibleProps = definition.props.filter(
    (prop) =>
      !(definition.previewKind && prop.name === "children") &&
      `${prop.name} ${prop.type}`.toLowerCase().includes(normalizedPropFilter),
  );
  const componentProps = visibleProps.filter(
    (prop) => !prop.hostProp && prop.name !== variantSchema?.name,
  );
  const hostProps = visibleProps.filter((prop) => prop.hostProp);
  const hostPropCount = definition.props.filter((prop) => prop.hostProp).length;
  const hasOpenProp = definition.props.some((prop) => prop.name === "open");
  const previewBounds = (props.sceneBounds ?? props.defaultBounds ?? props.bounds) as
    | { height?: unknown }
    | undefined;
  const previewHeight = Math.min(
    MAX_PREVIEW_HEIGHT,
    Math.max(MIN_PREVIEW_HEIGHT, Number(previewBounds?.height) || DEFAULT_PREVIEW_HEIGHT),
  );

  const recordEvent = (name: string, args: unknown[]) => {
    setEvents((current) => [...current, eventSummary(name, args)].slice(-EVENT_LOG_LIMIT));
  };

  const updateFromCallback = (name: string, args: unknown[]) => {
    const target = callbackTarget[name as keyof typeof callbackTarget];
    if (target) {
      setProps((current) => ({ ...current, [target]: args[0] }));
    } else if (name === "onChange" && args[0] && typeof args[0] === "object" && "text" in args[0]) {
      const selection = args[0] as { text: string; selectionStart?: number; selectionEnd?: number };
      setProps((current) => ({
        ...current,
        text: selection.text,
        selectionStart: selection.selectionStart ?? 0,
        selectionEnd: selection.selectionEnd ?? 0,
      }));
    }
    recordEvent(name, args);
  };

  const updateProperty = (name: string, value: unknown) => {
    setProps((current) => ({ ...current, [name]: value }));
  };

  const makeCallback = (name: string) => {
    if (name === "renderTrigger")
      return (triggerProps: Record<string, unknown> & { buttonRef?: Ref<HTMLButtonElement> }) => {
        const { buttonRef, ...buttonProps } = triggerProps;
        return createElement(Button, {
          ...(buttonProps as ButtonProps),
          buttonRef,
          text: typeof props.label === "string" ? props.label : "Edit",
          variant: ButtonVariant.Standard,
        });
      };
    if (name === "paintBackground" && definition.name === "Slider") return paintSliderBackground;
    if (name === "paint" || name === "paintBackground") return paintSample;
    if (name === "caretAt")
      return (text: string, logicalX: number) => Math.round(Math.min(text.length, logicalX));
    if (name === "describeResults")
      return (count: number, query: string, section: string) =>
        `${count} ${count === 1 ? "result" : "results"}${query ? ` for ${query}` : ""} in ${section}`;
    if (name === "measureText") return (text: string) => text.length;
    if (name === "valueFormat") return (value: string | number) => String(value);
    if (name === "translateKey" || name === "translateSource") return (text: string) => text;
    if (name === "onInputElement" || name === "buttonRef" || name === "onRootRef") return () => {};
    return (...args: unknown[]) => updateFromCallback(name, args);
  };

  const materialize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(materialize);
    if (!value || typeof value !== "object") return value;

    const record = value as Record<string, unknown>;
    if (GALLERY_CALLBACK_KEY in record) return makeCallback(String(record[GALLERY_CALLBACK_KEY]));
    if (GALLERY_ICON_KEY in record)
      return createElement(UiIcon, {
        part: String(record[GALLERY_ICON_KEY]) as UiPartName,
        scale: 2,
        color: "currentColor",
      });
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [key, materialize(child)]),
    );
  };

  const runtimeProps = useMemo(() => {
    const next = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [key, materialize(value)]),
    );
    for (const schema of definition.props) {
      if (schema.kind !== "callback") continue;
      next[schema.name] = enabledCallbacks[schema.name]
        ? makeCallback(schema.name)
        : schema.required
          ? () => {}
          : undefined;
    }
    for (const schema of definition.props) {
      if (
        schema.name === "children" &&
        schema.kind === "node" &&
        typeof props.children === "string"
      ) {
        next.children = createElement(
          "span",
          { className: styles["gallery-child"] },
          props.children,
        );
      }
    }
    return next;
    // Callbacks intentionally use the latest setter and preview state each render.
  }, [definition, props, enabledCallbacks]);

  const ComponentPreview = definition.component as ComponentType<Record<string, unknown>>;
  const reset = () => {
    setProps({ ...definition.initialProps });
    setEnabledCallbacks(callbackDefaults(definition));
    setEvents([]);
    setVariantProps({});
    setResetRevision((current) => current + 1);
  };

  const previewVariants: (string | number | undefined)[] = hasVariants
    ? [...variantOptions]
    : [undefined];
  const sliderVariantProps = (variant: string | number | undefined): EditableProps => {
    if (definition.name !== "Slider") return {};
    if (variant === "threshold")
      return {
        value: Array.isArray(props.value) ? props.value : [0.25, 0.75],
        sensorValue: typeof props.sensorValue === "number" ? props.sensorValue : 0.4,
      };
    return {
      value: typeof props.value === "number" ? props.value : 48,
      min: typeof props.min === "number" ? props.min : 0,
      max: typeof props.max === "number" ? props.max : 100,
    };
  };

  return (
    <article className={styles["gallery-card"]}>
      <GallerySectionHeading text="Preview" />
      <div
        className={`${styles["gallery-variant-grid"]} ${
          hasVariants ? "" : styles["gallery-variant-grid-single"]
        }`}
      >
        {previewVariants.map((variant) => {
          const variantKey = variant === undefined ? "default" : String(variant);
          const isOpen = !hasOpenProp ? true : props.open === true;
          const previewProps: EditableProps = {
            ...runtimeProps,
            ...variantProps[variantKey],
            ...sliderVariantProps(variant),
          };
          if (variantSchema && variant !== undefined) previewProps.variant = variant;
          if (definition.name === "Button") {
            const icon = typeof props.icon === "string" ? props.icon : "window_play_icon";
            previewProps.children = undefined;
            previewProps.icon = undefined;
            previewProps.label = undefined;
            previewProps.leading = undefined;
            previewProps.text = undefined;

            if (variant === "standard") {
              previewProps.text = typeof props.text === "string" ? props.text : "Apply";
              previewProps["aria-label"] = previewProps.text;
              previewProps.bounds = { x: 0, y: 0, width: 160, height: 32 };
              previewProps.part = "buttonset_item_normal";
            } else if (variant === "icon") {
              previewProps.icon = icon;
              previewProps.bounds = { x: 0, y: 0, width: 40, height: 40 };
              previewProps.part = "button_normal";
              previewProps["aria-label"] = "Play";
            } else if (variant === "flat-icon") {
              previewProps.icon = icon;
              previewProps.bounds = { x: 0, y: 0, width: 40, height: 40 };
              previewProps["aria-label"] = "Play";
            } else if (variant === "split") {
              previewProps.text = typeof props.text === "string" ? props.text : "Apply";
              previewProps["aria-label"] = previewProps.text;
              previewProps.bounds = { x: 0, y: 0, width: 184, height: 32 };
            } else if (variant === "color") {
              previewProps.text = typeof props.text === "string" ? props.text : "Apply";
              previewProps["aria-label"] = previewProps.text;
              previewProps.swatchColor =
                typeof props.swatchColor === "string" ? props.swatchColor : "#ffbf69";
              previewProps.bounds = { x: 0, y: 0, width: 160, height: 32 };
            } else if (variant === "tool") {
              previewProps.icon = icon;
              previewProps.bounds = { x: 0, y: 0, width: 40, height: 40 };
              previewProps.part = "toolbutton_normal";
              previewProps["aria-label"] = "Brush";
            }
          }
          if (hasOpenProp) previewProps.open = isOpen;
          if (hasVariants && enabledCallbacks.onOpenChange) {
            previewProps.onOpenChange = (open: boolean) =>
              updateFromCallback("onOpenChange", [open]);
          }
          if (definition.name === "Overlay" && variant === "popup") {
            previewProps.autoFocus = false;
            previewProps.closeOnOutsideClick = false;
          }
          if (definition.name === "Slider" && hasVariants && enabledCallbacks.onValueChange) {
            previewProps.onValueChange = (...args: unknown[]) => {
              setVariantProps((current) => ({
                ...current,
                [variantKey]: { ...current[variantKey], value: args[0] },
              }));
              recordEvent("onValueChange", args);
            };
          }
          return (
            <section className={styles["gallery-variant-tile"]} key={variantKey}>
              {variant !== undefined && (
                <h3 className={styles["gallery-variant-title"]}>
                  {String(variant).replace(/[-_]/g, " ")}
                </h3>
              )}
              <div className={styles["gallery-preview"]} style={{ height: previewHeight }}>
                <GalleryScrollRegion
                  ariaLabel={`${definition.name} ${variant ?? ""} preview`}
                  className={styles["gallery-preview-scroll"]}
                  contentClassName={styles["gallery-preview-content"]}
                  contentRevision={resetRevision}
                >
                  {hasOpenProp && !isOpen ? (
                    <div className={styles["gallery-preview-closed"]}>
                      <Button
                        onClick={() => {
                          setProps((current) => ({ ...current, open: true }));
                        }}
                        text={variant === undefined ? "Open preview" : `Open ${variant} preview`}
                        variant={ButtonVariant.Standard}
                      />
                    </div>
                  ) : (
                    <PreviewBoundary
                      key={`${definition.name}:${variantKey}:${resetRevision}`}
                      resetRevision={resetRevision}
                    >
                      {createElement(ComponentPreview, {
                        ...previewProps,
                        children: previewProps.children,
                      })}
                    </PreviewBoundary>
                  )}
                </GalleryScrollRegion>
              </div>
            </section>
          );
        })}
      </div>
      <Panel
        className={styles["gallery-console"]}
        extra={
          <Button
            aria-label="Clear console"
            onClick={() => setEvents([])}
            text="Clear"
            variant={ButtonVariant.Standard}
          />
        }
        title="Console"
      >
        <GalleryScrollRegion
          ariaLabel="Console output"
          className={styles["gallery-console-scroll"]}
          contentClassName={styles["gallery-console-output"]}
          contentRevision={events.length}
        >
          {events.length > 0
            ? events.map((event, index) => <code key={`${event}:${index}`}>{event}</code>)
            : null}
        </GalleryScrollRegion>
      </Panel>
      <section className={styles["gallery-props"]} aria-label="Parameters">
        <GallerySectionHeading text="Parameters" />
        <div className={styles["gallery-props-toolbar"]}>
          <div className={styles["gallery-filter"]}>
            <div className={styles["gallery-filter-entry"]}>
              <Input
                aria-label="Filter parameters"
                bounds={FILTER_ENTRY_BOUNDS}
                mini
                onValueChange={setPropFilter}
                placeholder="Filter…"
                size={24}
                style={{ maxWidth: "100%" }}
                type="search"
                value={propFilter}
              />
            </div>
          </div>
          <Button
            aria-label="Reset parameters"
            onClick={reset}
            text="Reset"
            variant={ButtonVariant.Standard}
          />
        </div>
        <div className={styles["gallery-fields"]}>
          {componentProps.map((schema) => (
            <PropControl
              callbackEnabled={enabledCallbacks[schema.name] !== false}
              onCallbackChange={(enabled) =>
                setEnabledCallbacks((current) => ({ ...current, [schema.name]: enabled }))
              }
              onChange={(value) => updateProperty(schema.name, value)}
              key={`${schema.name}:${resetRevision}`}
              schema={schema}
              value={props[schema.name]}
            />
          ))}
        </div>
        {hostPropCount > 0 && (
          <details className={styles["gallery-host-props"]}>
            <summary>Advanced parameters</summary>
            <GalleryScrollRegion
              ariaLabel="Advanced parameters"
              className={styles["gallery-host-props-scroll"]}
              contentClassName={styles["gallery-fields"]}
              contentRevision={hostProps.length}
            >
              {hostProps.map((schema) => (
                <PropControl
                  callbackEnabled={enabledCallbacks[schema.name] !== false}
                  onCallbackChange={(enabled) =>
                    setEnabledCallbacks((current) => ({ ...current, [schema.name]: enabled }))
                  }
                  onChange={(value) => updateProperty(schema.name, value)}
                  key={schema.name}
                  schema={schema}
                  value={props[schema.name]}
                />
              ))}
            </GalleryScrollRegion>
          </details>
        )}
      </section>
    </article>
  );
}

interface GalleryProps {
  iconClipboard: IconClipboard;
}

export default function Gallery({ iconClipboard }: GalleryProps) {
  const [open, setOpen] = useState(true);
  const [copyNotice, setCopyNotice] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (!copyNotice) return;
    const timer = setTimeout(() => setCopyNotice(null), COPY_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [copyNotice]);
  const copyIconKey = async (key: UiPartName) => {
    try {
      await iconClipboard.copyKey(key);
      setCopyNotice({ text: `Copied: ${key}` });
    } catch {
      setCopyNotice({ text: "Copy failed" });
    }
  };
  const { ref: workspaceRef, width, height } = useGalleryElementSize<HTMLDivElement>();
  const [filter, setFilter] = useState("");
  const [componentSlug, setComponentSlug] = useState(() => readComponentSlug());
  const [galleryPage, setGalleryPage] = useState(() => readGalleryPage());
  const { style } = useUi();
  const filteredComponents = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return generatedUIComponents;
    return generatedUIComponents.filter((component) => {
      const searchable = [component.name, ...component.props.map((prop) => prop.name)].join(" ");
      return searchable.toLowerCase().includes(query);
    });
  }, [filter]);
  const icons = useMemo(
    () =>
      Object.entries(style.parts)
        .filter(([, part]) => part.slices === null)
        .map(([name, part]) => ({
          name: name as UiPartName,
          width: part.width,
          height: part.height,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [style.parts],
  );
  const iconGroups = useMemo(() => {
    const sizes = new Map<string, { width: number; height: number; icons: typeof icons }>();
    for (const icon of icons) {
      const key = `${icon.width} × ${icon.height}`;
      const group = sizes.get(key);
      if (group) group.icons.push(icon);
      else sizes.set(key, { width: icon.width, height: icon.height, icons: [icon] });
    }
    const groups = [...sizes.values()]
      .filter((group) => group.icons.length >= MIN_ICON_GROUP_SIZE)
      .sort((left, right) => left.width - right.width || left.height - right.height)
      .map((group) => ({ title: `${group.width} × ${group.height}`, icons: group.icons }));
    const others = [...sizes.values()]
      .filter((group) => group.icons.length < MIN_ICON_GROUP_SIZE)
      .flatMap((group) => group.icons)
      .sort((left, right) => left.name.localeCompare(right.name));
    if (others.length) groups.push({ title: OTHER_ICONS_GROUP_TITLE, icons: others });
    return groups;
  }, [icons]);
  const visibleIconGroups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return iconGroups;
    return iconGroups
      .map((group) => ({
        ...group,
        icons: group.icons.filter((icon) => icon.name.toLowerCase().includes(query)),
      }))
      .filter((group) => group.icons.length > 0);
  }, [filter, iconGroups]);
  const activeComponent = generatedUIComponents.find(
    (component) =>
      componentSlugFromName(component.name) === (componentSlug ?? DEFAULT_COMPONENT_SLUG),
  );

  useEffect(() => {
    const updateRoute = () => {
      setComponentSlug(readComponentSlug());
      setGalleryPage(readGalleryPage());
    };
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  const handleComponentSelect = (slug: string) => {
    const pathname = `/components/${slug}`;
    if (window.location.pathname !== pathname) window.history.pushState(null, "", pathname);
    setComponentSlug(slug);
    setGalleryPage("components");
  };

  const handleGalleryPageChange = (page: string) => {
    const nextPage = page === "icons" ? "icons" : "components";
    const selectedSlug = componentSlug ?? DEFAULT_COMPONENT_SLUG;
    const pathname = nextPage === "icons" ? "/icons" : `/components/${selectedSlug}`;
    if (window.location.pathname !== pathname) window.history.pushState(null, "", pathname);
    setComponentSlug(selectedSlug);
    setGalleryPage(nextPage);
  };

  const pageTitle = galleryPage === "icons" ? "Icons" : (activeComponent?.name ?? "Components");

  const windowBounds = {
    x: Math.round((width * (1 - GALLERY_WINDOW_RATIO)) / 2),
    y: Math.round((height * (1 - GALLERY_WINDOW_RATIO)) / 2),
    width: Math.round(width * GALLERY_WINDOW_RATIO),
    height: Math.round(height * GALLERY_WINDOW_RATIO),
  };

  return (
    <main className={styles["gallery-workspace"]} ref={workspaceRef}>
      {!open && (
        <Button onClick={() => setOpen(true)} text="UI Gallery" variant={ButtonVariant.Standard} />
      )}
      {width > 0 && height > 0 && (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="UI Gallery"
          bounds={windowBounds}
          sceneBounds={{ width, height }}
          moveable={false}
          resizable={false}
          autoFocus={false}
          contentLayout={OverlayContentLayout.Flow}
        >
          {({ clientBounds }) => (
            <div className={styles["gallery"]} style={{ height: clientBounds.height }}>
              <Toast text={copyNotice?.text ?? null} />
              <div className={styles["gallery-body"]}>
                <aside className={styles["gallery-sidebar"]} aria-label="Gallery navigation">
                  <div className={styles["gallery-search"]}>
                    <div className={styles["gallery-search-entry"]}>
                      <Input
                        aria-label="Find a component, prop, or icon"
                        bounds={HEADER_SEARCH_BOUNDS}
                        id="gallery-filter"
                        style={{ maxWidth: "100%" }}
                        leading={<UiIcon part="icon_search" scale={2} color="currentColor" />}
                        onValueChange={setFilter}
                        placeholder="Search"
                        size={24}
                        type="search"
                        value={filter}
                      />
                    </div>
                  </div>
                  <div className={styles["gallery-sidebar-content"]}>
                    <GalleryComponentNavigation
                      components={filteredComponents}
                      componentSlug={
                        galleryPage === "icons"
                          ? "icons"
                          : (componentSlug ?? DEFAULT_COMPONENT_SLUG)
                      }
                      onSelect={(value) =>
                        value === "icons"
                          ? handleGalleryPageChange(value)
                          : handleComponentSelect(value)
                      }
                    />
                  </div>
                </aside>
                <div className={styles["gallery-content"]}>
                  <GallerySectionHeading text={pageTitle} />
                  <section
                    className={styles["gallery-tab-content"]}
                    hidden={galleryPage !== "components"}
                    aria-label="Components"
                  >
                    {activeComponent && (
                      <div className={styles["gallery-detail-content"]}>
                        <GalleryScrollRegion
                          ariaLabel={`${activeComponent.name} page`}
                          className={styles["gallery-detail-scroll"]}
                          contentClassName={styles["gallery-detail-scroll-content"]}
                        >
                          <GalleryCard definition={activeComponent} key={activeComponent.name} />
                        </GalleryScrollRegion>
                      </div>
                    )}
                  </section>
                  <section
                    className={`${styles["gallery-tab-content"]} ${styles["gallery-icons"]}`}
                    hidden={galleryPage !== "icons"}
                    aria-label="Icons"
                  >
                    <GalleryScrollRegion
                      ariaLabel="UI atlas icons"
                      className={styles["gallery-icon-scroll"]}
                      contentClassName={styles["gallery-icon-groups"]}
                      contentRevision={visibleIconGroups.reduce(
                        (total, group) => total + group.icons.length,
                        0,
                      )}
                    >
                      {visibleIconGroups.map((group) => (
                        <section
                          className={styles["gallery-icon-group"]}
                          key={group.title}
                          aria-label={group.title}
                        >
                          <GallerySectionHeading text={group.title} />
                          <div className={styles["gallery-icon-grid"]}>
                            {group.icons.map((icon) => {
                              const scale = Math.max(
                                1,
                                Math.min(3, Math.floor(64 / Math.max(icon.width, icon.height))),
                              );
                              return (
                                <Button
                                  className={styles["gallery-icon-card"]}
                                  key={icon.name}
                                  aria-label={`Copy ${icon.name}`}
                                  paintArtwork={false}
                                  style={{ width: "100%", height: "auto" }}
                                  onClick={() => void copyIconKey(icon.name)}
                                >
                                  <span className={styles["gallery-icon-art"]}>
                                    <UiIcon aria-hidden="true" part={icon.name} scale={scale} />
                                  </span>
                                  <strong>{icon.name}</strong>
                                </Button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </GalleryScrollRegion>
                  </section>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </main>
  );
}

function componentSlugFromName(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function readComponentSlug() {
  const route = window.location.pathname.match(/^\/components\/([^/]+)\/?$/);
  return route?.[1] ?? DEFAULT_COMPONENT_SLUG;
}

function readGalleryPage() {
  return /^\/icons\/?$/.test(window.location.pathname) ? "icons" : "components";
}
