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
  type ButtonHTMLAttributes,
} from "react";

import { ComponentsPageScrollPreview } from "$/components/page-scroll-preview";
import {
  generatedUIComponents,
  ComponentsGroup,
  type ComponentsDefinition,
  type ComponentsPropSchema,
} from "$/generated-ui-components";
import { COMPONENTS_THEMES } from "$/managers/appearance";
import { useComponentsTranslation } from "$/managers/components-language";
import { useComponentsLanguage } from "$/managers/components-language";
import type { IconClipboard } from "$/managers/ports/icon-clipboard";
import { PublicLanguage } from "@xprite/growth-content/language";
import { siteApplications } from "@xprite/growth-content/navigation";
import menuIconUrl from "@xprite/site-assets/menu-icon.svg";
import { SiteMenubar } from "@xprite/site-shell";
import {
  FontRole,
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
  ListBoxMode,
  ListBoxBorderStyle,
  IconKind,
  type IconProps,
  type ListBoxItem,
  Icon,
  MenuCheckType,
  OverlayContentLayout,
  Panel,
  PanelVariant,
  WindowWorkspace,
  Pattern,
  PatternId,
  PatternKind,
  DEFAULT_PATTERN_ID,
  patternDefinition,
  macintoshTheme,
  ContentLayout,
  ContentPadding,
  RichText,
  Text,
  TextVariant,
  ScrollArea,
  ScrollAreaTarget,
  ScrollbarStyle,
  Toast,
  ToastTone,
  type SurfaceBounds,
  type SurfaceViewport,
  useUi,
  type UiTheme,
  IconSize,
} from "@xprite/ui";
import { paintUiPart, paintUiText, useUiAssets, type UiPartName } from "@xprite/ui/assets";
import { layoutSize, observeResize } from "@xprite/ui/utils";

import styles from "$/components.module.css";

const COMPONENTS_CALLBACK_KEY = "$componentsCallback";
const COMPONENTS_ICON_KEY = "$componentsIcon";
const CALLBACK_PLACEHOLDER = "[Callback]";
const EVENT_LOG_LIMIT = 200;
const DEFAULT_ENUM_VALUE = "__components_default__";
const DEFAULT_COMPONENT_SLUG = "button";
const COMPONENTS_WINDOW_RATIO = 0.8;
const COMPONENTS_MENU_BAR_HEIGHT = 22;
const ICON_TILE_EXTENT = IconSize.Large;
const MAX_ATLAS_ICON_SCALE = 3;
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

const CALLBACK_STATE_FIELDS = new Set<string>(Object.values(callbackTarget));

type EditableProps = Record<string, unknown>;

function useComponentsElementSize<ElementType extends HTMLElement>() {
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

function ComponentsSectionHeading({ text }: { text: string }) {
  const t = useComponentsTranslation();

  const { ref, width } = useComponentsElementSize<HTMLHeadingElement>();
  return (
    <h2 aria-label={t(text)} className={styles["components-section-heading"]} ref={ref}>
      <Divider
        pixelSize={{ width: width / ARTWORK_SCALE, height: SECTION_HEADING_HEIGHT }}
        text={t(text)}
      />
    </h2>
  );
}

function ComponentsFormControl({
  children,
}: {
  children: ReactNode | ((pixelWidth: number) => ReactNode);
}) {
  const { ref, width } = useComponentsElementSize<HTMLDivElement>();
  return (
    <div className={styles["components-themed-control"]} ref={ref}>
      {typeof children === "function" ? width > 0 && children(width / ARTWORK_SCALE) : children}
    </div>
  );
}

function ComponentsNavigationSearch({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useComponentsTranslation();

  const { ref, width } = useComponentsElementSize<HTMLDivElement>();
  return (
    <div className={styles["components-search"]}>
      <div className={styles["components-search-entry"]} ref={ref}>
        {width > 0 && (
          <Input
            aria-label={t("Find a component, prop, or icon")}
            pixelWidth={width / ARTWORK_SCALE}
            id="components-filter"
            leading={<Icon kind="icon_search" scale={2} color="currentColor" />}
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

interface ComponentsScrollRegionProps {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  contentClassName?: string;
  contentRevision?: number;
  scrollbarStyle?: ScrollbarStyle;
}

function ComponentsScrollRegion({
  ariaLabel,
  children,
  className,
  contentClassName,
  contentRevision = 0,
  scrollbarStyle,
}: ComponentsScrollRegionProps) {
  const t = useComponentsTranslation();

  return (
    <ScrollArea
      className={`${styles["components-scroll-region"]} ${className}`}
      scrollX={false}
      scrollbarStyle={scrollbarStyle}
      reserveScrollbarGutter
      contentRevision={contentRevision}
      contentClassName={[styles["components-scroll-content"], contentClassName]
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

function ComponentsNavigationGroup({ label }: { label: string }) {
  const t = useComponentsTranslation();

  const { ref, width } = useComponentsElementSize<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={styles["components-navigation-group"]}
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

function ComponentsNavigation({
  components,
  componentSlug,
  onSelect,
}: {
  components: readonly ComponentsDefinition[];
  componentSlug: string;
  onSelect: (slug: string) => void;
}) {
  const t = useComponentsTranslation();

  const { ref, width, height } = useComponentsElementSize<HTMLElement>();
  const items = useMemo<ListBoxItem[]>(
    () =>
      Object.values(ComponentsGroup).flatMap((group): ListBoxItem[] => {
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
    [components],
  );
  const selectedValue = items.some((item) => !item.separator && item.value === componentSlug)
    ? componentSlug
    : "";

  return (
    <nav aria-label={t("UI components")} className={styles["components-component-nav"]} ref={ref}>
      {width > 0 && height > 0 && (
        <ListBox
          aria-label={t("UI components")}
          bounds={{ x: 0, y: 0, width, height }}
          font={FontRole.Primary}
          border={{ style: ListBoxBorderStyle.Single }}
          scrollbarStyle={ScrollbarStyle.Transparent}
          itemHeight={COMPONENT_NAV_ITEM_HEIGHT}
          separatorHeight={COMPONENT_NAV_GROUP_HEIGHT}
          renderGroup={(item) => <ComponentsNavigationGroup label={t(item.label ?? "")} />}
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
    if (this.state.error) return <p className={styles["components-error"]}>{this.state.error}</p>;
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
  if (COMPONENTS_CALLBACK_KEY in record) return CALLBACK_PLACEHOLDER;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, toEditorValue(child)]),
  );
}

function fromEditorValue(value: unknown, key = "callback"): unknown {
  if (value === CALLBACK_PLACEHOLDER) return { [COMPONENTS_CALLBACK_KEY]: key };
  if (Array.isArray(value)) return value.map((child) => fromEditorValue(child));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, fromEditorValue(child, childKey)]),
  );
}

function callbackDefaults(definition: ComponentsDefinition) {
  return Object.fromEntries(
    definition.props
      .filter((prop) => prop.kind === "callback")
      .map((prop) => [
        prop.name,
        ["renderItem", "renderGroup"].includes(prop.name) ||
        prop.name.endsWith("Ref") ||
        prop.name === "onInputElement" ||
        (definition.name === "Panel" && prop.name === "onDismiss") ||
        (definition.name === "Slider" && prop.name === "paintBackground")
          ? false
          : prop.required ||
            (!prop.hostProp && prop.name.startsWith("on")) ||
            (definition.initialProps[prop.name] !== null &&
              typeof definition.initialProps[prop.name] === "object" &&
              COMPONENTS_CALLBACK_KEY in
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
  schema: ComponentsPropSchema;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useComponentsTranslation();

  return (
    <ComponentsFormControl>
      <Checkbox
        aria-label={t(schema.name)}
        checked={enabled}
        label={t(schema.name)}
        mini
        onCheckedChange={onChange}
      />
    </ComponentsFormControl>
  );
}

function JsonControl({
  schema,
  value,
  onChange,
}: {
  schema: ComponentsPropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const t = useComponentsTranslation();

  const [draft, setDraft] = useState(() => stringify(value));
  const [invalid, setInvalid] = useState(false);

  return (
    <Field label={t(schema.name)} layout={FieldLayout.Horizontal}>
      <TextArea
        presentation={TextAreaPresentation.Code}
        resize={TextAreaResize.Vertical}
        height={JSON_EDITOR_HEIGHT}
        scrollbarStyle={ScrollbarStyle.Compact}
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
  schema: ComponentsPropSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  callbackEnabled: boolean;
  onCallbackChange: (value: boolean) => void;
}) {
  const t = useComponentsTranslation();

  if (schema.kind === "callback")
    return (
      <CallbackControl enabled={callbackEnabled} onChange={onCallbackChange} schema={schema} />
    );

  if (schema.kind === "array" || schema.kind === "json" || schema.kind === "node")
    return <JsonControl onChange={onChange} schema={schema} value={value} />;

  if (schema.kind === "boolean")
    return (
      <ComponentsFormControl>
        <Checkbox
          aria-label={t(schema.name)}
          checked={Boolean(value)}
          label={t(schema.name)}
          mini
          onCheckedChange={onChange}
        />
      </ComponentsFormControl>
    );

  if (schema.kind === "enum")
    return (
      <Field label={t(schema.name)} layout={FieldLayout.Horizontal}>
        <ComponentsFormControl>
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
        </ComponentsFormControl>
      </Field>
    );

  return (
    <Field label={t(schema.name)} layout={FieldLayout.Horizontal}>
      <ComponentsFormControl>
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
      </ComponentsFormControl>
    </Field>
  );
}

function ComponentsCanvasPreview({ props }: { props: EditableProps }) {
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

function ComponentsPreview({
  definition,
  props,
}: {
  definition: ComponentsDefinition;
  props: EditableProps;
}) {
  const { ref, width } = useComponentsElementSize<HTMLDivElement>();
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
    <div ref={ref} className={styles["components-preview-plane"]}>
      {width > 0 && <ComponentsPreviewContent definition={definition} props={next} />}
    </div>
  );
}

function ComponentsPreviewContent({
  definition,
  props,
}: {
  definition: ComponentsDefinition;
  props: EditableProps;
}) {
  const t = useComponentsTranslation();

  const { style } = useUi();
  if (definition.name === "CanvasSurface") return <ComponentsCanvasPreview props={props} />;
  if (definition.name === "ScrollArea" && props.target === ScrollAreaTarget.Page)
    return <ComponentsPageScrollPreview props={props} />;
  if (definition.name === "Field") return <ComponentsFieldPreview props={props} />;
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
        className={styles["components-pixel-preview"]}
        style={{
          width: box?.width ?? LIST_PREVIEW_WIDTH,
          height: box?.height ?? DEFAULT_PREVIEW_HEIGHT,
        }}
      >
        {preview}
      </div>
    );
  }
  if (definition.name === "Button" && props.variant === ButtonVariant.Push && !props.href) {
    return (
      <div className={styles["components-button-actions"]}>
        {preview}
        <Button href="#navigation-preview" text={t("Open editor")} slots={{}} />
      </div>
    );
  }
  return preview;
}

function ComponentsFieldPreview({ props }: { props: EditableProps }) {
  const t = useComponentsTranslation();

  const initialValue = typeof props.children === "string" ? props.children : "12";
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  return (
    <Field {...props} label={props.label as ReactNode}>
      <Input aria-label={t("Brush size")} value={value} onValueChange={setValue} />
    </Field>
  );
}

interface ComponentsCardProps {
  definition: ComponentsDefinition;
  events: readonly string[];
  onRecordEvent: (event: string) => void;
  onClearConsole: () => void;
}

function ComponentsCard({
  definition: baseDefinition,
  events,
  onRecordEvent,
  onClearConsole,
}: ComponentsCardProps) {
  const t = useComponentsTranslation();

  const definition = baseDefinition;
  const [props, setProps] = useState<EditableProps>(() => ({ ...definition.initialProps }));
  const variantProperty = definition.variantProperty ?? "variant";
  const behaviorProperty = definition.behaviorProperty;
  const behavior = behaviorProperty ? props[behaviorProperty] : undefined;
  const variants = useMemo(
    () =>
      (definition.variants ?? []).flatMap((variant) => {
        if (!variant.modes?.length) return [variant];
        const mode = variant.modes.find((entry) => entry.value === behavior);
        return mode ? [{ ...variant, props: mode.props, initialProps: mode.initialProps }] : [];
      }),
    [definition, behavior],
  );
  const hasVariants = !!definition.variants?.length;
  const commonSchemas = useMemo(
    () =>
      definition.props.flatMap((schema) => {
        if (hasVariants && schema.name === variantProperty) return [];
        if (!hasVariants || schema.hostProp) return [schema];
        if (schema.name === behaviorProperty) return [schema];
        if (CALLBACK_STATE_FIELDS.has(schema.name) || schema.name in callbackTarget) return [];
        const first = variants[0]?.props.find((field) => field.name === schema.name);
        return first &&
          variants.every((variant) =>
            variant.props.some((field) => field.name === schema.name && field.type === first.type),
          )
          ? [first]
          : [];
      }),
    [definition, variants, hasVariants, variantProperty, behaviorProperty],
  );
  const commonNames = useMemo(
    () => new Set(commonSchemas.map((schema) => schema.name)),
    [commonSchemas],
  );
  const [enabledCallbacks, setEnabledCallbacks] = useState<Record<string, boolean>>(() =>
    callbackDefaults(definition),
  );
  const [variantProps, setVariantProps] = useState<Record<string, EditableProps>>({});
  const [variantCallbacks, setVariantCallbacks] = useState<Record<string, Record<string, boolean>>>(
    {},
  );
  const [propFilter, setPropFilter] = useState("");
  const [resetRevision, setResetRevision] = useState(0);
  const valuesForVariant = (variantKey?: string): EditableProps => {
    const variant = variants.find((entry) => String(entry.value) === variantKey);
    if (!variant) return props;
    const shared = Object.fromEntries(
      Object.entries(props).filter(([name]) => commonNames.has(name)),
    );
    return {
      ...variant.initialProps,
      ...shared,
      ...variantProps[String(variant.value)],
      [variantProperty]: variant.value,
    };
  };
  const callbacksForVariant = (variantKey?: string) => {
    const variant = variants.find((entry) => String(entry.value) === variantKey);
    const defaults = variant
      ? Object.fromEntries(
          Object.entries(callbackDefaults({ ...definition, props: variant.props })).filter(
            ([name]) => !commonNames.has(name),
          ),
        )
      : {};
    return {
      ...enabledCallbacks,
      ...defaults,
      ...(variantKey === undefined ? {} : variantCallbacks[variantKey]),
    };
  };
  const updateValues = (update: (current: EditableProps) => EditableProps, variantKey?: string) => {
    if (variantKey === undefined) {
      setProps(update);
      return;
    }
    setVariantProps((current) => {
      const initial =
        variants.find((entry) => String(entry.value) === variantKey)?.initialProps ?? {};
      const shared = Object.fromEntries(
        Object.entries(props).filter(([name]) => commonNames.has(name)),
      );
      const before = { ...initial, ...shared, ...current[variantKey] };
      const after = update(before);
      const changes = Object.fromEntries(
        Object.entries(after).filter(([name, value]) => !Object.is(value, before[name])),
      );
      if (!Object.keys(changes).length) return current;
      return { ...current, [variantKey]: { ...current[variantKey], ...changes } };
    });
  };
  const normalizedPropFilter = propFilter.trim().toLowerCase();
  const visibleProps = commonSchemas.filter(
    (prop) =>
      !(
        definition.name === "Pattern" &&
        ["foreground", "background"].includes(prop.name) &&
        patternDefinition((props.pattern as PatternId | undefined) ?? DEFAULT_PATTERN_ID).kind !==
          PatternKind.TwoColor
      ) &&
      !(definition.previewKind && prop.name === "children") &&
      `${prop.name} ${prop.type}`.toLowerCase().includes(normalizedPropFilter),
  );
  const componentProps = visibleProps.filter((prop) => !prop.hostProp);
  const hostProps = visibleProps.filter((prop) => prop.hostProp);
  const hostPropCount = definition.props.filter((prop) => prop.hostProp).length;
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

  const updateFromCallback = (name: string, args: unknown[], variantKey?: string) => {
    const target = callbackTarget[name as keyof typeof callbackTarget];
    if (target) {
      updateValues((current) => ({ ...current, [target]: args[0] }), variantKey);
    } else if (name === "onChange" && args[0] && typeof args[0] === "object" && "text" in args[0]) {
      const selection = args[0] as { text: string; selectionStart?: number; selectionEnd?: number };
      updateValues(
        (current) => ({
          ...current,
          text: selection.text,
          selectionStart: selection.selectionStart ?? 0,
          selectionEnd: selection.selectionEnd ?? 0,
        }),
        variantKey,
      );
    }
    recordEvent(variantKey ? `${variantKey}.${name}` : name, args);
  };

  const updateProperty = (name: string, value: unknown) => {
    if (name === behaviorProperty) {
      const eligible =
        definition.variants?.filter((variant) =>
          variant.modes?.some((mode) => mode.value === value),
        ) ?? [];
      const preferred =
        eligible.find((variant) => variant.value === definition.initialProps[variantProperty]) ??
        eligible[0];
      const next = preferred?.modes?.find((mode) => mode.value === value);
      if (!next) return;
      setProps({ ...next.initialProps });
      setVariantProps({});
      setVariantCallbacks({});
      setResetRevision((current) => current + 1);
      onClearConsole();
      return;
    }
    setProps((current) => ({ ...current, [name]: value }));
    setVariantProps((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, values]) => {
          const next = { ...values };
          delete next[name];
          return [key, next];
        }),
      ),
    );
  };

  const makeCallback = (name: string, variantKey?: string, values = props) => {
    if (definition.name === "Tabs" && name === "onClose")
      return (id: string) => {
        updateValues((current) => {
          const tabs = (current.tabs as { id: string }[]).filter((tab) => tab.id !== id);
          return {
            ...current,
            tabs,
            value: current.value === id ? (tabs[0]?.id ?? "") : current.value,
          };
        }, variantKey);
        recordEvent(name, [id]);
      };
    if (definition.name === "Tabs" && name === "onReorder")
      return (id: string, targetId: string) => {
        updateValues((current) => {
          const tabs = [...(current.tabs as { id: string }[])];
          const from = tabs.findIndex((tab) => tab.id === id);
          const to = tabs.findIndex((tab) => tab.id === targetId);
          if (from < 0 || to < 0) return current;
          const [tab] = tabs.splice(from, 1);
          tabs.splice(to, 0, tab);
          return { ...current, tabs };
        }, variantKey);
        recordEvent(name, [id, targetId]);
      };
    if (name === "renderItem") return (item: { label: string }) => item.label;
    if (name === "renderGroup") return (item: { label?: string }) => item.label ?? "";
    if (name === "renderTrigger")
      return (triggerProps: Record<string, unknown> & { buttonRef?: Ref<HTMLButtonElement> }) => {
        const { buttonRef, ...buttonProps } = triggerProps;
        return createElement(Button, {
          ...(buttonProps as Omit<ButtonHTMLAttributes<HTMLButtonElement>, "part">),
          buttonRef,
          text: typeof values.label === "string" ? values.label : "Edit",
          variant: ButtonVariant.Push,
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
    return (...args: unknown[]) => updateFromCallback(name, args, variantKey);
  };

  const materialize = (value: unknown, variantKey?: string, values = props): unknown => {
    if (Array.isArray(value)) return value.map((child) => materialize(child, variantKey, values));
    if (!value || typeof value !== "object") return value;

    const record = value as Record<string, unknown>;
    if (COMPONENTS_CALLBACK_KEY in record)
      return makeCallback(String(record[COMPONENTS_CALLBACK_KEY]), variantKey, values);
    if (COMPONENTS_ICON_KEY in record)
      return createElement(Icon, {
        kind: String(record[COMPONENTS_ICON_KEY]) as UiPartName,
        scale: 2,
        color: "currentColor",
      });
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [key, materialize(child, variantKey, values)]),
    );
  };

  const runtimePropsFor = (
    schemas: readonly ComponentsPropSchema[],
    values: EditableProps,
    callbacks: Record<string, boolean>,
    variantKey?: string,
  ) => {
    const next = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, materialize(value, variantKey, values)]),
    );
    for (const schema of schemas) {
      if (schema.kind !== "callback") continue;
      next[schema.name] = callbacks[schema.name]
        ? makeCallback(schema.name, variantKey, values)
        : schema.required
          ? () => {}
          : values[schema.name] !== null && typeof values[schema.name] !== "object"
            ? values[schema.name]
            : undefined;
    }
    for (const schema of schemas) {
      if (
        definition.name !== "Text" &&
        schema.name === "children" &&
        schema.kind === "node" &&
        typeof values.children === "string"
      ) {
        next.children = createElement(
          "span",
          {
            className:
              definition.name === "ScrollArea"
                ? styles["components-scroll-sample"]
                : styles["components-child"],
          },
          values.children,
        );
      }
    }
    return next;
  };

  const reset = () => {
    setProps({ ...definition.initialProps });
    setEnabledCallbacks(callbackDefaults(definition));
    onClearConsole();
    setVariantProps({});
    setVariantCallbacks({});
    setResetRevision((current) => current + 1);
  };

  const previewVariants: (string | number | undefined)[] = hasVariants
    ? variants.map((variant) => variant.value)
    : [undefined];

  return (
    <WindowWorkspace className={styles["components-card"]}>
      <ComponentsSectionHeading text={t("Preview")} />
      <div
        className={`${styles["components-variant-grid"]} ${variants.length > 1 ? "" : styles["components-variant-grid-single"]}`}
      >
        {previewVariants.map((variant) => {
          const variantKey = variant === undefined ? undefined : String(variant);
          const variantDefinition = variants.find((entry) => entry.value === variant);
          const schemas = variantDefinition
            ? [...definition.props.filter((schema) => schema.hostProp), ...variantDefinition.props]
            : definition.props;
          const values = valuesForVariant(variantKey);
          const callbacks = callbacksForVariant(variantKey);
          const hasOpenProp = schemas.some((schema) => schema.name === "open");
          const isOpen = !hasOpenProp || values.open === true;
          const runtimeProps = runtimePropsFor(schemas, values, callbacks, variantKey);
          const previewProps: EditableProps = {
            ...runtimeProps,
          };
          if (
            definition.name === "ListBox" &&
            values.mode === ListBoxMode.Multiple &&
            Array.isArray(previewProps.items)
          ) {
            previewProps.items = previewProps.items.map(
              (item: { separator?: boolean; label?: string }) =>
                item.separator ? { ...item, label: item.label ?? "More tools" } : item,
            );
          }
          if (definition.name === "ListBox") {
            if (values.mode !== ListBoxMode.Navigation) {
              for (const key of [
                "activeHref",
                "scrollViewportRef",
                "viewportProps",
                "reserveScrollbarGutter",
              ])
                delete previewProps[key];
            }
            if (values.mode === ListBoxMode.Navigation) {
              const bounds = values.bounds as { width?: number; height?: number } | undefined;
              previewProps.style = {
                width: bounds?.width ?? LIST_PREVIEW_WIDTH,
                height: bounds?.height ?? LIST_PREVIEW_HEIGHT,
                ...(values.style as CSSProperties | undefined),
              };
              const items = Array.isArray(previewProps.items) ? previewProps.items : [];
              previewProps.items = items
                .filter((item: { separator?: boolean }) => !item.separator)
                .map((item: { href?: string; value?: string; label: string }) =>
                  item.href ? item : { href: `#${item.value}`, label: item.label },
                );
              previewProps.activeHref ??=
                typeof values.value === "string" ? `#${values.value}` : undefined;
              for (const key of [
                "bounds",
                "pixelSize",
                "relativeTo",
                "viewport",
                "value",
                "values",
                "onValueChange",
                "onValuesChange",
                "onActivate",
                "disabled",
                "itemHeight",
                "sectionHeight",
                "headingHeight",
                "font",
                "scrollbarStyle",
                "separatorHeight",
                "renderItem",
                "renderGroup",
              ])
                delete previewProps[key];
            } else if (values.mode === ListBoxMode.Multiple) {
              const bounds = values.bounds as { width?: number; height?: number } | undefined;
              previewProps.style = {
                width: bounds?.width ?? LIST_PREVIEW_WIDTH,
                height: bounds?.height ?? LIST_PREVIEW_HEIGHT,
                ...(values.style as CSSProperties | undefined),
              };
              for (const key of [
                "bounds",
                "pixelSize",
                "relativeTo",
                "value",
                "onValueChange",
                "font",
                "scrollbarStyle",
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
            const icon = typeof values.icon === "string" ? values.icon : "window_play_icon";
            previewProps.children = undefined;
            previewProps.icon = undefined;
            previewProps.label = undefined;
            previewProps.leading = undefined;
            previewProps.text = undefined;
            previewProps.slots = undefined;
            previewProps.href = undefined;

            if (variant === "tile") {
              previewProps.text = typeof values.text === "string" ? values.text : "Button";
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
            } else if (variant === "push") {
              previewProps.text = typeof values.text === "string" ? values.text : "Button";
              previewProps["aria-label"] = previewProps.text;
              previewProps.bounds = undefined;
              previewProps.slots = runtimeProps.slots ?? {};
              previewProps.href =
                typeof values.href === "string" && values.href ? values.href : undefined;
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
              previewProps.text = typeof values.text === "string" ? values.text : "Apply";
              previewProps["aria-label"] = previewProps.text;
              previewProps.bounds = undefined;
              previewProps.pixelSize = undefined;
              previewProps.slots = runtimeProps.slots ?? {};
            } else if (variant === "color") {
              previewProps.text = typeof values.text === "string" ? values.text : "Apply";
              previewProps["aria-label"] = previewProps.text;
              previewProps.swatchColor =
                typeof values.swatchColor === "string" ? values.swatchColor : "#ffbf69";
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
                text={t(typeof values.children === "string" ? values.children : "Help")}
                aria-label={t("Tooltip help")}
              />
            );
          }
          if (hasOpenProp) previewProps.open = isOpen;
          if (definition.name === "Overlay" && variant === "popup") {
            previewProps.autoFocus = false;
            previewProps.closeOnOutsideClick = false;
          }
          if (definition.name === "AlertDialog" && Array.isArray(previewProps.actions)) {
            previewProps.actions = previewProps.actions.map(
              (action: { label: string; onClick?: () => void }) => ({
                ...action,
                onClick: () => {
                  action.onClick?.();
                  updateValues((current) => ({ ...current, open: false }), variantKey);
                },
              }),
            );
          }
          return (
            <section className={styles["components-variant-tile"]} key={variantKey ?? "default"}>
              {variant !== undefined && (
                <h3 className={styles["components-variant-title"]}>
                  {String(variant).replace(/[-_]/g, " ")}
                </h3>
              )}
              <div
                className={styles["components-preview"]}
                role="region"
                aria-label={t(`${definition.name} ${variant ?? ""} preview`.replace(/\s+/g, " "))}
                data-components-preview
              >
                <div
                  className={styles["components-preview-content"]}
                  style={{ minHeight: previewHeight }}
                >
                  {hasOpenProp && !isOpen ? (
                    <div className={styles["components-preview-closed"]}>
                      <Button
                        onClick={() =>
                          updateValues((current) => ({ ...current, open: true }), variantKey)
                        }
                        text={variant === undefined ? "Open preview" : `Open ${variant} preview`}
                        variant={ButtonVariant.Push}
                      />
                    </div>
                  ) : (
                    <PreviewBoundary
                      key={`${definition.name}:${variantKey}:${resetRevision}`}
                      resetRevision={resetRevision}
                    >
                      <ComponentsPreview
                        definition={{ ...definition, props: schemas }}
                        props={previewProps}
                      />
                    </PreviewBoundary>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <Panel
        className={styles["components-console"]}
        contentLayout={ContentLayout.Fill}
        variant={PanelVariant.Utility}
        collapsible
        title={t("Console")}
      >
        <ComponentsScrollRegion
          ariaLabel={t("Console output")}
          className={styles["components-console-scroll"]}
          contentClassName={styles["components-console-output"]}
          contentRevision={events.length}
        >
          {events.length > 0
            ? events.map((event, index) => <code key={`${event}:${index}`}>{event}</code>)
            : null}
        </ComponentsScrollRegion>
      </Panel>
      <Panel
        className={styles["components-props"]}
        contentPadding={ContentPadding.Medium}
        title={t("Parameters")}
        variant={PanelVariant.Utility}
        collapsible
      >
        <div className={styles["components-props-toolbar"]}>
          <div className={styles["components-filter"]}>
            <div className={styles["components-filter-entry"]}>
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
            variant={ButtonVariant.Push}
          />
        </div>
        <div className={styles["components-fields"]}>
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
        {hasVariants &&
          variants.map((variant) => {
            const variantKey = String(variant.value);
            const fields = variant.props.filter(
              (schema) =>
                !commonNames.has(schema.name) &&
                schema.name !== variantProperty &&
                !(definition.previewKind && schema.name === "children") &&
                `${schema.name} ${schema.type}`.toLowerCase().includes(normalizedPropFilter),
            );
            if (!fields.length) return null;
            const values = valuesForVariant(variantKey);
            const callbacks = callbacksForVariant(variantKey);
            return (
              <Panel
                key={variantKey}
                variant={PanelVariant.Content}
                title={variantKey.replace(/[-_]/g, " ")}
                contentPadding={ContentPadding.Medium}
              >
                <div className={styles["components-fields"]}>
                  {fields.map((schema) => (
                    <PropControl
                      key={`${variantKey}:${schema.name}:${resetRevision}`}
                      schema={schema}
                      value={values[schema.name]}
                      callbackEnabled={callbacks[schema.name] !== false}
                      onChange={(value) =>
                        updateValues(
                          (current) => ({ ...current, [schema.name]: value }),
                          variantKey,
                        )
                      }
                      onCallbackChange={(enabled) =>
                        setVariantCallbacks((current) => ({
                          ...current,
                          [variantKey]: { ...current[variantKey], [schema.name]: enabled },
                        }))
                      }
                    />
                  ))}
                </div>
              </Panel>
            );
          })}
        {hostPropCount > 0 && (
          <Panel
            className={styles["components-host-props"]}
            title={t("Advanced parameters")}
            variant={PanelVariant.Utility}
            collapsible
            defaultCollapsed
          >
            <ComponentsScrollRegion
              ariaLabel={t("Advanced parameters")}
              className={styles["components-host-props-scroll"]}
              contentClassName={styles["components-fields"]}
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
            </ComponentsScrollRegion>
          </Panel>
        )}
      </Panel>
    </WindowWorkspace>
  );
}

interface ComponentsProps {
  iconClipboard: IconClipboard;
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
}

export default function Components({ iconClipboard, theme, onThemeChange }: ComponentsProps) {
  const t = useComponentsTranslation();
  const { language, setLanguage } = useComponentsLanguage();

  const [open, setOpen] = useState(true);
  const [consoleEvents, setConsoleEvents] = useState<string[]>([]);
  const recordConsoleEvent = useCallback((event: string) => {
    setConsoleEvents((current) => [...current, event].slice(-EVENT_LOG_LIMIT));
  }, []);
  const clearConsole = useCallback(() => setConsoleEvents([]), []);
  const [userWindowBounds, setUserWindowBounds] = useState<SurfaceBounds>();
  const [copyNotice, setCopyNotice] = useState<{ text: string; tone: ToastTone } | null>(null);
  useEffect(() => {
    if (!copyNotice) return;
    const timer = setTimeout(() => setCopyNotice(null), COPY_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [copyNotice]);
  const copyIconKey = async (key: IconKind | UiPartName) => {
    try {
      await iconClipboard.copyKey(key);
      setCopyNotice({ text: `Copied: ${key}`, tone: ToastTone.Success });
    } catch {
      setCopyNotice({ text: "Copy failed", tone: ToastTone.Error });
    }
  };
  const { ref: workspaceRef, width, height } = useComponentsElementSize<HTMLDivElement>();
  const [filter, setFilter] = useState("");
  const [componentSlug, setComponentSlug] = useState(() => readComponentSlug());
  const { style } = useUi();
  const icons = useMemo(() => {
    const artworkKinds = Object.values(IconKind);
    return [
      ...artworkKinds.map((name) => ({
        name,
        props: { kind: name, size: ICON_TILE_EXTENT } as IconProps,
      })),
      ...Object.entries(style.parts)
        .filter(([name, part]) => part.slices === null && !artworkKinds.includes(name as IconKind))
        .map(([name, part]) => ({
          name: name as UiPartName,
          props: {
            kind: name as UiPartName,
            scale: Math.max(
              1,
              Math.min(
                MAX_ATLAS_ICON_SCALE,
                Math.floor(ICON_TILE_EXTENT / Math.max(part.width, part.height)),
              ),
            ),
          } as IconProps,
        })),
    ].sort((left, right) => left.name.localeCompare(right.name));
  }, [style.parts]);
  const visibleIcons = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? icons.filter((icon) => icon.name.toLowerCase().includes(query)) : icons;
  }, [filter, icons]);
  const filteredComponents = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return generatedUIComponents;
    return generatedUIComponents.filter((component) => {
      const searchable = [
        component.name,
        component.description,
        ...component.props.map((prop) => prop.name),
      ].join(" ");
      return (
        searchable.toLowerCase().includes(query) ||
        (component.name === "Icon" && visibleIcons.length > 0)
      );
    });
  }, [filter, visibleIcons]);
  const activeComponent = generatedUIComponents.find(
    (component) =>
      componentSlugFromName(component.name) === (componentSlug ?? DEFAULT_COMPONENT_SLUG),
  );

  useEffect(() => {
    const updateRoute = () => {
      clearConsole();
      setComponentSlug(readComponentSlug());
    };
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, [clearConsole]);

  const handleComponentSelect = (slug: string) => {
    if (slug !== componentSlug) clearConsole();
    const pathname = `${import.meta.env.BASE_URL}${slug}`;
    if (window.location.pathname !== pathname) window.history.pushState(null, "", pathname);
    setComponentSlug(slug);
  };

  const pageTitle = activeComponent?.name ?? "Components";

  const applicationMenus = [
    {
      label: t("Edit"),
      mnemonicIndex: -1,
      items: [
        {
          label: t("Clear Console"),
          disabled: !open || activeComponent?.name === "Icon" || consoleEvents.length === 0,
          onSelect: clearConsole,
        },
      ],
    },
  ];
  const menuBarHeight = style.dimensions.menubar_height ?? COMPONENTS_MENU_BAR_HEIGHT;
  const desktopHeight = Math.max(0, height - menuBarHeight);
  const windowBounds = {
    x: Math.round((width * (1 - COMPONENTS_WINDOW_RATIO)) / 2),
    y: menuBarHeight + Math.round((desktopHeight * (1 - COMPONENTS_WINDOW_RATIO)) / 2),
    width: Math.round(width * COMPONENTS_WINDOW_RATIO),
    height: Math.round(desktopHeight * COMPONENTS_WINDOW_RATIO),
  };

  return (
    <main
      className={styles["components-workspace"]}
      ref={workspaceRef}
      data-components-macintosh={theme === macintoshTheme || undefined}
    >
      {theme === macintoshTheme && (
        <Pattern
          pattern={PatternId.System7Pattern04}
          className={styles["components-desktop-pattern"]}
          aria-hidden="true"
        />
      )}
      <header
        className={styles["components-menubar"]}
        style={
          {
            height: menuBarHeight,
            "--ui-menu-navigation-height": `${menuBarHeight}px`,
          } as CSSProperties
        }
      >
        <SiteMenubar
          label={t("Web Components menu")}
          applicationName={t("Web Components")}

          applications={siteApplications("/components/", language)}
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
              children: COMPONENTS_THEMES.map((option) => ({
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
          text={t("Web Components")}
          variant={ButtonVariant.Push}
        />
      )}
      {width > 0 && height > 0 && (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) clearConsole();
          }}
          title={t("Web Components")}
          bounds={userWindowBounds ?? windowBounds}
          onBoundsChange={setUserWindowBounds}
          sceneBounds={{ width, height }}
          movable
          resizable
          autoFocus={false}
          contentLayout={OverlayContentLayout.Flow}
        >
          {({ clientBounds }) => (
            <div className={styles["components"]} style={{ height: clientBounds.height }}>
              <Toast text={copyNotice ? t(copyNotice.text) : null} tone={copyNotice?.tone} />
              <div className={styles["components-body"]}>
                <aside
                  className={styles["components-sidebar"]}
                  aria-label={t("Web Components navigation")}
                >
                  <ComponentsNavigationSearch value={filter} onValueChange={setFilter} />
                  <div className={styles["components-sidebar-content"]}>
                    <ComponentsNavigation
                      components={filteredComponents}
                      componentSlug={componentSlug ?? DEFAULT_COMPONENT_SLUG}
                      onSelect={handleComponentSelect}
                    />
                  </div>
                </aside>
                <div className={styles["components-content"]}>
                  <ComponentsSectionHeading text={t(pageTitle)} />
                  <section
                    className={styles["components-tab-content"]}
                    aria-label={t("Components")}
                  >
                    {activeComponent && (
                      <div className={styles["components-detail-content"]}>
                        <ComponentsScrollRegion
                          ariaLabel={t(`${activeComponent.name} page`)}
                          scrollbarStyle={ScrollbarStyle.Classic}
                          className={styles["components-detail-scroll"]}
                          contentClassName={styles["components-detail-scroll-content"]}
                        >
                          {activeComponent.name === "Icon" ? (
                            <div className={styles["components-icon-grid"]}>
                              {visibleIcons.map((icon) => (
                                <Button
                                  className={styles["components-icon-card"]}
                                  key={icon.name}
                                  aria-label={t(`Copy ${icon.name}`)}
                                  paintArtwork={false}
                                  style={{ width: "100%", height: "auto" }}
                                  onClick={() => void copyIconKey(icon.name)}
                                >
                                  <span className={styles["components-icon-art"]}>
                                    <Icon aria-hidden="true" {...icon.props} />
                                  </span>
                                  <strong>{icon.name}</strong>
                                </Button>
                              ))}
                              {visibleIcons.length === 0 && (
                                <Text variant={TextVariant.Inline}>{t("No matching icons")}</Text>
                              )}
                            </div>
                          ) : (
                            <ComponentsCard
                              definition={activeComponent}
                              events={consoleEvents}
                              onRecordEvent={recordConsoleEvent}
                              onClearConsole={clearConsole}
                              key={activeComponent.name}
                            />
                          )}
                        </ComponentsScrollRegion>
                      </div>
                    )}
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
  return route ? route[1] : DEFAULT_COMPONENT_SLUG;
}
