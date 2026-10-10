import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type CSSProperties,
  type ReactNode,
} from "react";

import { GalleryPageScrollPreview } from "$/components/page-scroll-preview";
import {
  generatedUIComponents,
  GalleryComponentGroup,
  type GalleryComponentDefinition,
  type GalleryPropSchema,
} from "$/generated-ui-components";
import { GALLERY_THEMES } from "$/managers/appearance";
import { useGalleryTranslation } from "$/managers/gallery-language";
import { useGalleryLanguage } from "$/managers/gallery-language";
import type { IconClipboard } from "$/managers/ports/icon-clipboard";
import { PublicLanguage } from "@xprite/growth-content/language";
import { siteApplications } from "@xprite/growth-content/navigation";
import menuIconUrl from "@xprite/site-assets/menu-icon.svg";
import { SiteMenubar } from "@xprite/site-shell";
import {
  CanvasSurface,
  Button,
  ButtonVariant,
  Checkbox,
  Combobox,
  Dialog,
  Divider,
  Input,
  Field,
  FieldLayout,
  TextArea,
  TextAreaPresentation,
  TextAreaResize,
  ListBox,
  ListBoxFrameStyle,
  IconKind,
  type ListBoxItem,
  Icon,
  MenuCheckType,
  OverlayContentLayout,
  Panel,
  PanelVariant,
  PanelWindowKind,
  WindowWorkspace,
  Pattern,
  PatternVariant,
  macintoshTheme,
  ContentLayout,
  ContentPadding,
  RichText,
  ScrollArea,
  type ScrollbarVariant,
  Toast,
  type ButtonProps,
  type SurfaceBounds,
  type SurfaceViewport,
  useUi,
  type UiTheme,
  IconSize,
} from "@xprite/ui";
import { UiIcon, paintUiPart, paintUiText, useUiAssets, type UiPartName } from "@xprite/ui/assets";
import { layoutSize, observeResize } from "@xprite/ui/utils";

import styles from "$/gallery.module.css";

const GALLERY_CALLBACK_KEY = "$galleryCallback";
const GALLERY_ICON_KEY = "$galleryIcon";
const CALLBACK_PLACEHOLDER = "[Gallery callback]";
const EVENT_LOG_LIMIT = 200;
const DEFAULT_ENUM_VALUE = "__gallery_default__";
const DEFAULT_COMPONENT_SLUG = "button";
const GALLERY_WINDOW_RATIO = 0.8;
const GALLERY_MENU_BAR_HEIGHT = 22;
const MIN_ICON_GROUP_SIZE = 4;
const OTHER_ICONS_GROUP_TITLE = "Others";
const COPY_NOTICE_DURATION_MS = 1800;
const SECTION_HEADING_HEIGHT = 12;
const ARTWORK_SCALE = 2;
const FILTER_ENTRY_PIXEL_WIDTH = 90;
const JSON_EDITOR_HEIGHT = 96;
const MIN_PREVIEW_HEIGHT = 64;
const DEFAULT_PREVIEW_HEIGHT = 96;
const TOOLTIP_PREVIEW_HEIGHT = 144;
const PANEL_PREVIEW_HEIGHT = 160;
const COMPONENT_NAV_GROUP_HEIGHT = 32;
const COMPONENT_NAV_GROUP_LABEL_HEIGHT = 20;
const LIST_PREVIEW_WIDTH = 220;
const LIST_PREVIEW_HEIGHT = 100;
const MAX_PREVIEW_HEIGHT = 420;
const COMPONENT_NAV_ITEM_HEIGHT = 24;

const callbackTarget = {
  onOpenChange: "open",
  onCollapsedChange: "collapsed",
  onExpandedChange: "expanded",
  onCheckedChange: "checked",
  onValueChange: "value",
  onBoundsChange: "bounds",
  onPan: "pan",
  onPointsChange: "points",
  onSelectionChange: "selectedIndex",
  onValuesChange: "values",
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
  const t = useGalleryTranslation();

  const { ref, width } = useGalleryElementSize<HTMLHeadingElement>();
  return (
    <h2 aria-label={t(text)} className={styles["gallery-section-heading"]} ref={ref}>
      <Divider
        pixelSize={{ width: width / ARTWORK_SCALE, height: SECTION_HEADING_HEIGHT }}
        text={t(text)}
      />
    </h2>
  );
}

function GalleryFormControl({
  children,
}: {
  children: ReactNode | ((pixelWidth: number) => ReactNode);
}) {
  const { ref, width } = useGalleryElementSize<HTMLDivElement>();
  return (
    <div className={styles["gallery-themed-control"]} ref={ref}>
      {typeof children === "function" ? width > 0 && children(width / ARTWORK_SCALE) : children}
    </div>
  );
}

function GalleryNavigationSearch({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useGalleryTranslation();

  const { ref, width } = useGalleryElementSize<HTMLDivElement>();
  return (
    <div className={styles["gallery-search"]}>
      <div className={styles["gallery-search-entry"]} ref={ref}>
        {width > 0 && (
          <Input
            aria-label={t("Find a component, prop, or icon")}
            pixelWidth={width / ARTWORK_SCALE}
            id="gallery-filter"
            leading={<UiIcon part="icon_search" scale={2} color="currentColor" />}
            onValueChange={onValueChange}
            placeholder={t("Search")}
            size={24}
            type="search"
            value={value}
          />
        )}
      </div>
    </div>
  );
}

interface GalleryScrollRegionProps {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  contentClassName?: string;
  contentRevision?: number;
  scrollbarVariant?: ScrollbarVariant;
}

function GalleryScrollRegion({
  ariaLabel,
  children,
  className,
  contentClassName,
  contentRevision = 0,
  scrollbarVariant,
}: GalleryScrollRegionProps) {
  const t = useGalleryTranslation();

  return (
    <ScrollArea
      className={`${styles["gallery-scroll-region"]} ${className}`}
      scrollX={false}
      scrollbarVariant={scrollbarVariant}
      reserveScrollbarGutter
      contentRevision={contentRevision}
      contentClassName={[styles["gallery-scroll-content"], contentClassName]
        .filter(Boolean)
        .join(" ")}
      aria-label={t(`${ariaLabel} scroll`)}
      viewportProps={{
        "aria-label": ariaLabel,
        "data-ui-scroll-region-focus": "true",
        role: "region",
        tabIndex: 0,
      }}
    >
      {children}
    </ScrollArea>
  );
}

function GalleryNavigationGroup({ label }: { label: string }) {
  const t = useGalleryTranslation();

  const { ref, width } = useGalleryElementSize<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={styles["gallery-navigation-group"]}
      style={{ paddingBlockStart: COMPONENT_NAV_GROUP_HEIGHT - COMPONENT_NAV_GROUP_LABEL_HEIGHT }}
    >
      {width > 0 && (
        <Divider
          pixelSize={{
            width: width / ARTWORK_SCALE,
            height: COMPONENT_NAV_GROUP_LABEL_HEIGHT / ARTWORK_SCALE,
          }}
          text={t(label)}
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
  const t = useGalleryTranslation();

  const { ref, width, height } = useGalleryElementSize<HTMLElement>();
  const items = useMemo<ListBoxItem[]>(
    () => [
      { value: "icons", label: t("Atlas icons") },
      ...Object.values(GalleryComponentGroup).flatMap((group): ListBoxItem[] => {
        const entries = components.filter((component) => component.group === group);
        return entries.length
          ? [
              { separator: true, label: group },
              ...entries.map((component) => ({
                value: componentSlugFromName(component.name),
                label: component.name,
              })),
            ]
          : [];
      }),
    ],
    [components],
  );
  const selectedValue = items.some((item) => !item.separator && item.value === componentSlug)
    ? componentSlug
    : "";

  return (
    <nav aria-label={t("UI components")} className={styles["gallery-component-nav"]} ref={ref}>
      {width > 0 && height > 0 && (
        <ListBox
          aria-label={t("UI components")}
          bounds={{ x: 0, y: 0, width, height }}
          font="default"
          frameStyle={ListBoxFrameStyle.Single}
          scrollbarVariant="transparent"
          itemHeight={COMPONENT_NAV_ITEM_HEIGHT}
          separatorHeight={COMPONENT_NAV_GROUP_HEIGHT}
          renderGroup={(item) => <GalleryNavigationGroup label={t(item.label ?? "")} />}
          items={items}
          onValueChange={onSelect}
          value={selectedValue}
        />
      )}
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
        ["renderItem", "renderGroup"].includes(prop.name) ||
        prop.name.endsWith("Ref") ||
        prop.name === "onInputElement" ||
        (definition.name === "Note" && prop.name === "onDismiss") ||
        (definition.name === "Slider" && prop.name === "paintBackground")
          ? false
          : prop.required ||
            (!prop.hostProp && prop.name.startsWith("on")) ||
            (definition.initialProps[prop.name] !== null &&
              typeof definition.initialProps[prop.name] === "object" &&
              GALLERY_CALLBACK_KEY in
                (definition.initialProps[prop.name] as Record<string, unknown>)),
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
  const t = useGalleryTranslation();

  return (
    <GalleryFormControl>
      <Checkbox
        aria-label={t(schema.name)}
        checked={enabled}
        label={t(schema.name)}
        mini
        onCheckedChange={onChange}
      />
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
  const t = useGalleryTranslation();

  const [draft, setDraft] = useState(() => stringify(value));
  const [invalid, setInvalid] = useState(false);

  return (
    <Field label={t(schema.name)} layout={FieldLayout.Horizontal}>
      <TextArea
        presentation={TextAreaPresentation.Code}
        resize={TextAreaResize.Vertical}
        height={JSON_EDITOR_HEIGHT}
        scrollbarVariant="mini"
        aria-label={t(schema.name)}
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
        rows={5}
        value={draft}
      />
    </Field>
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
  const t = useGalleryTranslation();

  if (schema.kind === "callback")
    return (
      <CallbackControl enabled={callbackEnabled} onChange={onCallbackChange} schema={schema} />
    );

  if (schema.kind === "array" || schema.kind === "json" || schema.kind === "node")
    return <JsonControl onChange={onChange} schema={schema} value={value} />;

  if (schema.kind === "boolean")
    return (
      <GalleryFormControl>
        <Checkbox
          aria-label={t(schema.name)}
          checked={Boolean(value)}
          label={t(schema.name)}
          mini
          onCheckedChange={onChange}
        />
      </GalleryFormControl>
    );

  if (schema.kind === "enum")
    return (
      <Field label={t(schema.name)} layout={FieldLayout.Horizontal}>
        <GalleryFormControl>
          {(pixelWidth) => (
            <Combobox
              aria-label={t(schema.name)}
              pixelWidth={pixelWidth}
              onValueChange={(nextValue) => {
                const option = schema.options?.find((candidate) => String(candidate) === nextValue);
                onChange(nextValue === DEFAULT_ENUM_VALUE ? undefined : (option ?? nextValue));
              }}
              options={[
                ...(!schema.required ? [{ value: DEFAULT_ENUM_VALUE, label: t("(default)") }] : []),
                ...(schema.options ?? []).map((option) => ({
                  value: String(option),
                  label: String(option),
                })),
              ]}
              value={value === null || value === undefined ? DEFAULT_ENUM_VALUE : String(value)}
            />
          )}
        </GalleryFormControl>
      </Field>
    );

  return (
    <Field label={t(schema.name)} layout={FieldLayout.Horizontal}>
      <GalleryFormControl>
        {(pixelWidth) => (
          <Input
            aria-label={t(schema.name)}
            pixelWidth={pixelWidth}
            onValueChange={(nextValue) =>
              onChange(schema.kind === "number" ? Number(nextValue) : nextValue)
            }
            size={24}
            type={schema.kind === "number" ? "number" : "text"}
            value={value === null || value === undefined ? "" : String(value)}
          />
        )}
      </GalleryFormControl>
    </Field>
  );
}

function GalleryCanvasPreview({ props }: { props: EditableProps }) {
  const assets = useUiAssets();
  const bounds = props.bounds as SurfaceBounds;
  return (
    <CanvasSurface
      bounds={bounds}
      style={{ display: "block" }}
      dependencies={[assets]}
      paint={(context) => {
        if (!assets) return;
        paintUiPart(
          context,
          assets,
          "button_normal",
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          { drawCenter: true },
        );
        paintUiText(context, assets, "Canvas artwork", bounds.x + 12, bounds.y + 12, {
          color: assets.style.colors.text,
        });
      }}
    />
  );
}

function GalleryComponentPreview({
  definition,
  props,
}: {
  definition: GalleryComponentDefinition;
  props: EditableProps;
}) {
  const { ref, width } = useGalleryElementSize<HTMLDivElement>();
  const next = { ...props };
  const viewport = props.viewport as SurfaceViewport | undefined;
  const availableWidth = viewport ? (width * viewport.sceneWidth) / viewport.width : width;
  if (width > 0) {
    for (const key of ["bounds", "defaultBounds", "sceneBounds", "clientBounds"]) {
      const bounds = props[key] as Partial<SurfaceBounds> | undefined;
      if (bounds && typeof bounds.width === "number") {
        const fittedWidth = Math.min(bounds.width, availableWidth);
        next[key] = {
          ...bounds,
          width: fittedWidth,
          ...(typeof bounds.x === "number"
            ? { x: Math.min(bounds.x, Math.max(0, availableWidth - fittedWidth)) }
            : {}),
        };
      }
    }
    if (typeof props.width === "number") next.width = Math.min(props.width, availableWidth);
    if (props.style && typeof props.style === "object") {
      const style = props.style as CSSProperties;
      next.style = {
        ...style,
        boxSizing: style.boxSizing ?? "border-box",
        ...(typeof style.width === "number" ? { width: Math.min(style.width, width) } : {}),
      };
    }
  }
  return (
    <div ref={ref} className={styles["gallery-preview-plane"]}>
      {width > 0 && <GalleryPreviewContent definition={definition} props={next} />}
    </div>
  );
}

function GalleryPreviewContent({
  definition,
  props,
}: {
  definition: GalleryComponentDefinition;
  props: EditableProps;
}) {
  const t = useGalleryTranslation();

  const { style } = useUi();
  if (definition.name === "CanvasSurface") return <GalleryCanvasPreview props={props} />;
  if (definition.name === "PageScrollArea") return <GalleryPageScrollPreview props={props} />;
  if (definition.name === "Field") return <GalleryFieldPreview props={props} />;
  if (definition.name === "RichText") {
    if (typeof props.markdown === "string" && props.markdown.length > 0) {
      const { children: _children, dangerouslySetInnerHTML: _html, ...markdownProps } = props;
      return createElement(definition.component, markdownProps);
    }
    const { markdown: _markdown, resolveImage: _resolveImage, children, ...markupProps } = props;
    if (markupProps.dangerouslySetInnerHTML)
      return createElement(definition.component, markupProps);
    return (
      <RichText {...markupProps}>
        <h1>{t("Sprite notes")}</h1>
        <p>{children as ReactNode}</p>
        <h2>{t("Animation")}</h2>
        <ul>
          <li>{t("8 frames")}</li>
          <li>{t("Transparent background")}</li>
        </ul>
        <p>
          <a href="#export">{t("Export the animation")}</a>
        </p>
      </RichText>
    );
  }
  if (definition.name === "Text") {
    const textProps = { ...props };
    if (props.variant === "inline" || props.variant === "reading") {
      textProps.ink = props.ink ?? (props.color === undefined ? style.colors.text : undefined);
    } else {
      textProps.color = props.color ?? style.colors.text;
    }
    return createElement(definition.component, textProps);
  }
  const preview = createElement(definition.component, { ...props, children: props.children });
  if (definition.name === "PixelImage") {
    const box = props.initialBox as { width?: number; height?: number } | undefined;
    return (
      <div
        className={styles["gallery-pixel-preview"]}
        style={{
          width: box?.width ?? LIST_PREVIEW_WIDTH,
          height: box?.height ?? DEFAULT_PREVIEW_HEIGHT,
        }}
      >
        {preview}
      </div>
    );
  }
  if (definition.name === "Button" && props.variant === ButtonVariant.Standard && !props.href) {
    return (
      <div className={styles["gallery-button-actions"]}>
        {preview}
        <Button href="#navigation-preview" text={t("Open editor")} slots={{}} />
      </div>
    );
  }
  return preview;
}

function GalleryFieldPreview({ props }: { props: EditableProps }) {
  const t = useGalleryTranslation();

  const initialValue = typeof props.children === "string" ? props.children : "12";
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  return (
    <Field {...props} label={props.label as ReactNode}>
      <Input aria-label={t("Brush size")} value={value} onValueChange={setValue} />
    </Field>
  );
}

interface GalleryCardProps {
  definition: GalleryComponentDefinition;
  events: readonly string[];
  onRecordEvent: (event: string) => void;
  onClearConsole: () => void;
}

function GalleryCard({ definition, events, onRecordEvent, onClearConsole }: GalleryCardProps) {
  const t = useGalleryTranslation();

  const [props, setProps] = useState<EditableProps>(() => ({ ...definition.initialProps }));
  const [enabledCallbacks, setEnabledCallbacks] = useState<Record<string, boolean>>(() =>
    callbackDefaults(definition),
  );
  const [propFilter, setPropFilter] = useState("");
  const [resetRevision, setResetRevision] = useState(0);
  const variantSchema = definition.props.find(
    (prop) =>
      prop.name === (definition.previewProperty ?? "variant") &&
      prop.kind === "enum" &&
      (prop.options?.length ?? 0) > 1,
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
    Math.max(
      definition.name === "Icon" ? IconSize.Small : MIN_PREVIEW_HEIGHT,
      Number(previewBounds?.height) ||
        (definition.name === "Tooltip"
          ? TOOLTIP_PREVIEW_HEIGHT
          : definition.name === "Panel"
            ? PANEL_PREVIEW_HEIGHT
            : definition.name === "Icon"
              ? IconSize.Small
              : DEFAULT_PREVIEW_HEIGHT),
    ),
  );

  const recordEvent = (name: string, args: unknown[]) => {
    onRecordEvent(eventSummary(name, args));
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
    if (definition.name === "Tabs" && name === "onClose")
      return (id: string) => {
        setProps((current) => {
          const tabs = (current.tabs as { id: string }[]).filter((tab) => tab.id !== id);
          return {
            ...current,
            tabs,
            value: current.value === id ? (tabs[0]?.id ?? "") : current.value,
          };
        });
        recordEvent(name, [id]);
      };
    if (definition.name === "Tabs" && name === "onReorder")
      return (id: string, targetId: string) => {
        setProps((current) => {
          const tabs = [...(current.tabs as { id: string }[])];
          const from = tabs.findIndex((tab) => tab.id === id);
          const to = tabs.findIndex((tab) => tab.id === targetId);
          if (from < 0 || to < 0) return current;
          const [tab] = tabs.splice(from, 1);
          tabs.splice(to, 0, tab);
          return { ...current, tabs };
        });
        recordEvent(name, [id, targetId]);
      };
    if (name === "renderItem") return (item: { label: string }) => item.label;
    if (name === "renderGroup") return (item: { label?: string }) => item.label ?? "";
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
    if (name.endsWith("Ref") || name === "onInputElement") return () => {};
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
          : props[schema.name] !== null && typeof props[schema.name] !== "object"
            ? props[schema.name]
            : undefined;
    }
    for (const schema of definition.props) {
      if (
        definition.name !== "Text" &&
        schema.name === "children" &&
        schema.kind === "node" &&
        typeof props.children === "string"
      ) {
        next.children = createElement(
          "span",
          {
            className:
              definition.name === "ScrollArea"
                ? styles["gallery-scroll-sample"]
                : styles["gallery-child"],
          },
          props.children,
        );
      }
    }
    return next;
    // Callbacks intentionally use the latest setter and preview state each render.
  }, [definition, props, enabledCallbacks, onRecordEvent]);

  const reset = () => {
    setProps({ ...definition.initialProps });
    setEnabledCallbacks(callbackDefaults(definition));
    onClearConsole();
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
    <WindowWorkspace className={styles["gallery-card"]}>
      <GallerySectionHeading text={t("Preview")} />
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
            ...sliderVariantProps(variant),
            ...variantProps[variantKey],
          };
          if (variantSchema && variant !== undefined) previewProps[variantSchema.name] = variant;
          if (
            definition.name === "ListBox" &&
            variant === "multiple" &&
            Array.isArray(previewProps.items)
          ) {
            previewProps.items = previewProps.items.map(
              (item: { separator?: boolean; label?: string }) =>
                item.separator ? { ...item, label: item.label ?? "More tools" } : item,
            );
          }
          if (definition.name === "ListBox") {
            if (variant === "multiple") {
              const bounds = props.bounds as { width?: number; height?: number } | undefined;
              previewProps.style = {
                width: bounds?.width ?? LIST_PREVIEW_WIDTH,
                height: bounds?.height ?? LIST_PREVIEW_HEIGHT,
                ...(props.style as CSSProperties | undefined),
              };
              for (const key of [
                "bounds",
                "pixelSize",
                "relativeTo",
                "value",
                "onValueChange",
                "font",
                "framed",
                "frameStyle",
                "scrollbarVariant",
                "separatorHeight",
              ])
                delete previewProps[key];
            } else {
              for (const key of [
                "values",
                "onValuesChange",
                "onActivate",
                "disabled",
                "sectionHeight",
                "headingHeight",
              ])
                delete previewProps[key];
            }
          }
          if (definition.name === "Button") {
            const icon = typeof props.icon === "string" ? props.icon : "window_play_icon";
            previewProps.children = undefined;
            previewProps.icon = undefined;
            previewProps.label = undefined;
            previewProps.leading = undefined;
            previewProps.text = undefined;
            previewProps.slots = undefined;
            previewProps.href = undefined;

            if (variant === "tile") {
              previewProps.text = typeof props.text === "string" ? props.text : "Button";
              previewProps.slots = runtimeProps.slots ?? {
                leading: <Icon kind={IconKind.Folder} size={IconSize.Large} />,
              };
              previewProps.bounds = undefined;
              previewProps.pixelSize = undefined;
              // Tile props are native attributes, so do not forward painter-only parameters.
              const tileKeys = new Set([
                "variant",
                "text",
                "slots",
                "tileSize",
                "compactOnSmallScreens",
                "disabled",
                "onClick",
                "className",
                "style",
                "aria-label",
              ]);
              for (const key of Object.keys(previewProps))
                if (!tileKeys.has(key)) delete previewProps[key];
            } else if (variant === "standard") {
              previewProps.text = typeof props.text === "string" ? props.text : "Button";
              previewProps["aria-label"] = previewProps.text;
              previewProps.bounds = undefined;
              previewProps.slots = runtimeProps.slots ?? {};
              previewProps.href =
                typeof props.href === "string" && props.href ? props.href : undefined;
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
              previewProps.bounds = undefined;
              previewProps.pixelSize = undefined;
              previewProps.slots = runtimeProps.slots ?? {};
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
              previewProps.hotPart = "toolbutton_hot";
              previewProps.pushedPart = "toolbutton_pushed";
              previewProps.focusedPart = "toolbutton_hot";
              previewProps.selectedPart = "toolbutton_pushed";
              previewProps["aria-label"] = "Brush";
            }
          }
          if (definition.name === "Tooltip") {
            previewProps.children = (
              <Button
                slots={{}}
                text={t(typeof props.children === "string" ? props.children : "Help")}
                aria-label={t("Tooltip help")}
              />
            );
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
          if (["Slider", "ListBox", "Note"].includes(definition.name) && hasVariants) {
            for (const callback of ["onValueChange", "onValuesChange", "onCollapsedChange"]) {
              if (!enabledCallbacks[callback]) continue;
              previewProps[callback] = (...args: unknown[]) => {
                setVariantProps((current) => ({
                  ...current,
                  [variantKey]: {
                    ...current[variantKey],
                    [callbackTarget[callback as keyof typeof callbackTarget]]: args[0],
                  },
                }));
                recordEvent(callback, args);
              };
            }
          }
          if (definition.name === "AlertDialog" && Array.isArray(previewProps.actions)) {
            previewProps.actions = previewProps.actions.map(
              (action: { label: string; onClick?: () => void }) => ({
                ...action,
                onClick: () => {
                  action.onClick?.();
                  setProps((current) => ({ ...current, open: false }));
                },
              }),
            );
          }
          return (
            <section className={styles["gallery-variant-tile"]} key={variantKey}>
              {variant !== undefined && (
                <h3 className={styles["gallery-variant-title"]}>
                  {String(variant).replace(/[-_]/g, " ")}
                </h3>
              )}
              <div
                className={styles["gallery-preview"]}
                role="region"
                aria-label={t(`${definition.name} ${variant ?? ""} preview`.replace(/\s+/g, " "))}
                data-gallery-preview
              >
                <div
                  className={styles["gallery-preview-content"]}
                  style={{ minHeight: previewHeight }}
                >
                  {hasOpenProp && !isOpen ? (
                    <div className={styles["gallery-preview-closed"]}>
                      <Button
                        onClick={() => setProps((current) => ({ ...current, open: true }))}
                        text={variant === undefined ? "Open preview" : `Open ${variant} preview`}
                        variant={ButtonVariant.Standard}
                      />
                    </div>
                  ) : (
                    <PreviewBoundary
                      key={`${definition.name}:${variantKey}:${resetRevision}`}
                      resetRevision={resetRevision}
                    >
                      <GalleryComponentPreview definition={definition} props={previewProps} />
                    </PreviewBoundary>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <Panel
        className={styles["gallery-console"]}
        contentLayout={ContentLayout.Fill}
        variant={PanelVariant.Window}
        windowKind={PanelWindowKind.Utility}
        collapsible
        title={t("Console")}
      >
        <GalleryScrollRegion
          ariaLabel={t("Console output")}
          className={styles["gallery-console-scroll"]}
          contentClassName={styles["gallery-console-output"]}
          contentRevision={events.length}
        >
          {events.length > 0
            ? events.map((event, index) => <code key={`${event}:${index}`}>{event}</code>)
            : null}
        </GalleryScrollRegion>
      </Panel>
      <Panel
        className={styles["gallery-props"]}
        contentPadding={ContentPadding.Standard}
        title={t("Parameters")}
        variant={PanelVariant.Window}
        windowKind={PanelWindowKind.Utility}
        collapsible
      >
        <div className={styles["gallery-props-toolbar"]}>
          <div className={styles["gallery-filter"]}>
            <div className={styles["gallery-filter-entry"]}>
              <Input
                aria-label={t("Filter parameters")}
                pixelWidth={FILTER_ENTRY_PIXEL_WIDTH}
                mini
                onValueChange={setPropFilter}
                placeholder={t("Filter…")}
                size={24}
                style={{ maxWidth: "100%" }}
                type="search"
                value={propFilter}
              />
            </div>
          </div>
          <Button
            aria-label={t("Reset parameters")}
            onClick={reset}
            text={t("Reset")}
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
          <Panel
            className={styles["gallery-host-props"]}
            title={t("Advanced parameters")}
            variant={PanelVariant.Window}
            windowKind={PanelWindowKind.Utility}
            collapsible
            defaultCollapsed
          >
            <GalleryScrollRegion
              ariaLabel={t("Advanced parameters")}
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
          </Panel>
        )}
      </Panel>
    </WindowWorkspace>
  );
}

interface GalleryProps {
  iconClipboard: IconClipboard;
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
}

export default function Gallery({ iconClipboard, theme, onThemeChange }: GalleryProps) {
  const t = useGalleryTranslation();
  const { language, setLanguage } = useGalleryLanguage();

  const [open, setOpen] = useState(true);
  const [consoleEvents, setConsoleEvents] = useState<string[]>([]);
  const recordConsoleEvent = useCallback((event: string) => {
    setConsoleEvents((current) => [...current, event].slice(-EVENT_LOG_LIMIT));
  }, []);
  const clearConsole = useCallback(() => setConsoleEvents([]), []);
  const [userWindowBounds, setUserWindowBounds] = useState<SurfaceBounds>();
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
      clearConsole();
      setComponentSlug(readComponentSlug());
      setGalleryPage(readGalleryPage());
    };
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, [clearConsole]);

  const handleComponentSelect = (slug: string) => {
    if (slug !== componentSlug) clearConsole();
    const pathname = `${import.meta.env.BASE_URL}${slug}`;
    if (window.location.pathname !== pathname) window.history.pushState(null, "", pathname);
    setComponentSlug(slug);
    setGalleryPage("components");
  };

  const handleGalleryPageChange = (page: string) => {
    const nextPage = page === "icons" ? "icons" : "components";
    const selectedSlug = componentSlug ?? DEFAULT_COMPONENT_SLUG;
    const pathname = `${import.meta.env.BASE_URL}${nextPage === "icons" ? "icons" : selectedSlug}`;
    if (window.location.pathname !== pathname) window.history.pushState(null, "", pathname);
    setComponentSlug(selectedSlug);
    setGalleryPage(nextPage);
  };

  const pageTitle = galleryPage === "icons" ? "Icons" : (activeComponent?.name ?? "Components");

  const applicationMenus = [
    {
      label: t("Edit"),
      mnemonicIndex: -1,
      items: [
        {
          label: t("Clear Console"),
          disabled: !open || galleryPage !== "components" || consoleEvents.length === 0,
          onSelect: clearConsole,
        },
      ],
    },
  ];
  const menuBarHeight = style.dimensions.menubar_height ?? GALLERY_MENU_BAR_HEIGHT;
  const desktopHeight = Math.max(0, height - menuBarHeight);
  const windowBounds = {
    x: Math.round((width * (1 - GALLERY_WINDOW_RATIO)) / 2),
    y: menuBarHeight + Math.round((desktopHeight * (1 - GALLERY_WINDOW_RATIO)) / 2),
    width: Math.round(width * GALLERY_WINDOW_RATIO),
    height: Math.round(desktopHeight * GALLERY_WINDOW_RATIO),
  };

  return (
    <main
      className={styles["gallery-workspace"]}
      ref={workspaceRef}
      data-gallery-macintosh={theme === macintoshTheme || undefined}
    >
      {theme === macintoshTheme && (
        <Pattern
          variant={PatternVariant.System7Pattern04}
          className={styles["gallery-desktop-pattern"]}
          aria-hidden="true"
        />
      )}
      <header
        className={styles["gallery-menubar"]}
        style={
          {
            height: menuBarHeight,
            "--ui-menu-navigation-height": `${menuBarHeight}px`,
          } as CSSProperties
        }
      >
        <SiteMenubar
          label={t("Gallery menu")}
          applicationName={t("UI Gallery")}

          applications={siteApplications("/components/", language, true)}
          language={language}
          languages={[
            {
              value: PublicLanguage.English,
              label: "English",
              onSelect: () => setLanguage(PublicLanguage.English),
            },
            {
              value: PublicLanguage.SimplifiedChinese,
              label: "简体中文",
              onSelect: () => setLanguage(PublicLanguage.SimplifiedChinese),
            },
          ]}
          menus={applicationMenus}
          brandImage={menuIconUrl}
          systemItems={[
            {
              label: t("Theme"),
              separator: true,
              children: GALLERY_THEMES.map((option) => ({
                label: option.label,
                checked: theme === option,
                checkType: MenuCheckType.Radio,
                onSelect: () => onThemeChange(option),
              })),
            },
          ]}
        />
      </header>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          text={t("UI Gallery")}
          variant={ButtonVariant.Standard}
        />
      )}
      {width > 0 && height > 0 && (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) clearConsole();
          }}
          title={t("UI Gallery")}
          bounds={userWindowBounds ?? windowBounds}
          onBoundsChange={setUserWindowBounds}
          sceneBounds={{ width, height }}
          moveable
          resizable
          autoFocus={false}
          contentLayout={OverlayContentLayout.Flow}
        >
          {({ clientBounds }) => (
            <div className={styles["gallery"]} style={{ height: clientBounds.height }}>
              <Toast text={copyNotice ? t(copyNotice.text) : null} />
              <div className={styles["gallery-body"]}>
                <aside className={styles["gallery-sidebar"]} aria-label={t("Gallery navigation")}>
                  <GalleryNavigationSearch value={filter} onValueChange={setFilter} />
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
                  <GallerySectionHeading text={t(pageTitle)} />
                  <section
                    className={styles["gallery-tab-content"]}
                    hidden={galleryPage !== "components"}
                    aria-label={t("Components")}
                  >
                    {activeComponent && (
                      <div className={styles["gallery-detail-content"]}>
                        <GalleryScrollRegion
                          ariaLabel={t(`${activeComponent.name} page`)}
                          scrollbarVariant="regular"
                          className={styles["gallery-detail-scroll"]}
                          contentClassName={styles["gallery-detail-scroll-content"]}
                        >
                          <GalleryCard
                            definition={activeComponent}
                            events={consoleEvents}
                            onRecordEvent={recordConsoleEvent}
                            onClearConsole={clearConsole}
                            key={activeComponent.name}
                          />
                        </GalleryScrollRegion>
                      </div>
                    )}
                  </section>
                  <section
                    className={`${styles["gallery-tab-content"]} ${styles["gallery-icons"]}`}
                    hidden={galleryPage !== "icons"}
                    aria-label={t("Icons")}
                  >
                    <GalleryScrollRegion
                      ariaLabel={t("UI atlas icons")}
                      scrollbarVariant="regular"
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
                          aria-label={t(group.title)}
                        >
                          <GallerySectionHeading text={t(group.title)} />
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
                                  aria-label={t(`Copy ${icon.name}`)}
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
  const route = window.location.pathname
    .slice(import.meta.env.BASE_URL.length)
    .match(/^([^/]+)\/?$/);
  return route && route[1] !== "icons" ? route[1] : DEFAULT_COMPONENT_SLUG;
}

function readGalleryPage() {
  return /^icons\/?$/.test(window.location.pathname.slice(import.meta.env.BASE_URL.length))
    ? "icons"
    : "components";
}
