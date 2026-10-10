import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript-compiler-api";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uiRoot = resolve(repositoryRoot, "packages/ui");
const entryPath = resolve(uiRoot, "src/components/index.ts");
const outputPath = resolve(repositoryRoot, "apps/gallery/src/generated-ui-components.ts");
const routesPath = resolve(repositoryRoot, "apps/gallery/build/generated-routes.json");
const GALLERY_CALLBACK_KEY = "$galleryCallback";
const GALLERY_ICON_KEY = "$galleryIcon";
const COMPONENT_GROUPS = {
  Controls: ["Button", "Checkbox", "Combobox", "CurveEditor", "Input", "Slider", "TextArea"],
  Typography: ["Text", "RichText"],
  Containers: ["Panel", "Field", "Note", "ScrollArea", "PageScrollArea", "Divider", "StatusBar"],
  Navigation: ["ListBox", "NavigationList", "Tabs", "Menu", "Menubar"],
  Overlays: ["Dialog", "AlertDialog", "Popover", "ContextMenu", "Tooltip", "Toast"],
  Media: ["Icon", "Pattern", "PixelImage"],
};
const PREVIEW_PROPERTIES = { Icon: "kind", ListBox: "selectionMode" };
const MAX_ENUM_OPTIONS = 32;
const MAX_SAMPLE_DEPTH = 3;

const sampleOverrides = {
  CanvasSurface: {
    bounds: { x: 0, y: 0, width: 240, height: 80 },
    viewport: undefined,
    paint: { [GALLERY_CALLBACK_KEY]: "paint" },
    pixels: undefined,
    checker: undefined,
  },
  ControlFlow: { enabled: true },
  ControlFlowItem: { bounds: { x: 0, y: 0, width: 240, height: 80 }, viewport: undefined },
  Panel: {
    title: "Layers",
    extra: null,
    children: "Panel content",
    groupBorder: "secondary",
    style: { width: 282, minHeight: 118 },
  },
  Field: {
    label: "Brush size",
    children: "12",
    description: "Width in pixels",
    error: undefined,
    controlId: undefined,
  },
  NavigationList: {
    items: [
      { href: "#overview", label: "Overview" },
      { href: "#frames", label: "Frames and layers" },
      { href: "#export", label: "Export" },
    ],
    activeHref: "#frames",
    style: { width: 240, height: 128 },
  },
  MenubarButton: { children: "Sound", icon: false },
  Icon: { kind: "application", size: 16 },
  Pattern: { children: null, preview: true, style: { width: 240, height: 120 } },
  PageScrollArea: { reserveGutter: true, documentGutter: false, children: null },
  StatusBar: { leading: "Frame 1 of 8", children: "16 × 16", trailing: "100%" },
  Note: {
    children: "Make your notes stand out and get noticed.",
    style: { width: 126, minHeight: 47 },
    title: "Read Me",
    dismissBehavior: "collapse",
    dismissLabel: undefined,
    collapseLabel: undefined,
    expandLabel: undefined,
    resizeLabel: undefined,
  },
  PanSurface: {
    pan: { x: 0, y: 0 },
    coordinateScale: { x: 1, y: 1 },
    handTool: true,
    panButtons: [0],
    onPan: { [GALLERY_CALLBACK_KEY]: "onPan" },
    style: { height: 80, border: "1px solid var(--xse-border)" },
  },
  PixelImage: {
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath fill='%235e99da' d='M2 2h12v12H2z'/%3E%3Cpath fill='%23f4ba58' d='M6 6h4v4H6z'/%3E%3C/svg%3E",
    alt: "Pixel artwork",
    width: 16,
    height: 16,
    initialBox: { width: 240, height: 80 },
  },
  Splitter: {
    axis: "horizontal",
    style: { width: 8, height: 80, background: "var(--xse-border)" },
  },
  CurveEditor: {
    bounds: { x: 0, y: 0, width: 336, height: 256 },
    points: [
      { x: 0, y: 0 },
      { x: 128, y: 160 },
      { x: 255, y: 255 },
    ],
    selectedIndex: 1,
    min: 0,
    max: 255,
    step: 1,
    "aria-label": "Color curve control points",
  },
  AlertDialog: {
    open: false,
    title: "Unsaved changes",
    messageLines: ["Save before closing?"],
    clientBounds: { x: 0, y: 0, width: 420, height: 300 },
    sceneBounds: { x: 0, y: 0, width: 420, height: 300 },
    cancelActionIndex: 1,
    actions: [
      { label: "Save", onClick: { [GALLERY_CALLBACK_KEY]: "onClick" } },
      { label: "Cancel", onClick: { [GALLERY_CALLBACK_KEY]: "onClick" } },
    ],
  },
  Button: {
    children: null,
    href: undefined,
    slots: undefined,
    selected: false,
    pressed: undefined,
    selectedIcon: undefined,
    bounds: { x: 0, y: 0, width: 160, height: 32 },
    color: undefined,
    fill: undefined,
    font: undefined,
    icon: "window_play_icon",
    insetContent: true,
    paintArtwork: true,
    part: "buttonset_item_normal",
    hotPart: "buttonset_item_hot",
    pushedPart: "buttonset_item_pushed",
    focusedPart: "buttonset_item_focused",
    selectedPart: "buttonset_item_active",
    text: "Button",
    label: "Button",
    menu: {
      label: "More actions",
      items: [
        { label: "Save as…", onSelect: { [GALLERY_CALLBACK_KEY]: "onSelect" } },
        { label: "Export…", onSelect: { [GALLERY_CALLBACK_KEY]: "onSelect" } },
      ],
    },
  },
  Checkbox: {
    label: "Pixel perfect",
    checked: true,
    bounds: undefined,
    pixelSize: undefined,
  },
  Combobox: {
    pixelWidth: undefined,
    value: "normal",
    options: [
      { value: "normal", label: "Normal" },
      { value: "multiply", label: "Multiply" },
      { value: "screen", label: "Screen" },
    ],
    bounds: { x: 0, y: 0, width: 156, height: 18 },
  },
  ContextMenu: {
    label: "Canvas actions",
    items: [{ label: "Duplicate" }, { label: "Delete" }],
  },
  InlineTextEditor: {
    text: "Rename layer",
    selectionStart: 0,
    selectionEnd: 5,
    bounds: { x: 0, y: 0, width: 220, height: 32 },
  },
  KeyboardShortcutsDialog: {
    open: false,
    labels: {
      title: "Keyboard shortcuts",
      search: "Search shortcuts",
      action: "Action",
      key: "Shortcut",
      context: "Context",
      confirm: "Confirm",
      cancel: "Cancel",
      fileActions: "File actions",
      list: "Shortcut list",
      describeResults: { [GALLERY_CALLBACK_KEY]: "describeResults" },
    },
    sceneBounds: { x: 0, y: 0, width: 540, height: 380 },
    sections: [
      {
        id: "file",
        label: "File",
        items: [
          { label: "New document", shortcut: "Ctrl+N", context: "Global" },
          { label: "Save", shortcut: "Ctrl+S", context: "Global" },
        ],
      },
    ],
  },
  Menu: {
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "Meta+Z" },
      { label: "Redo", shortcut: "Meta+Shift+Z" },
    ],
  },
  Menubar: {
    trailingMenus: undefined,
    bounds: undefined,
    width: 280,
    links: undefined,
    layout: undefined,
    leadingContent: undefined,
    trailingContent: undefined,
    menus: [
      {
        label: "File",
        items: [
          { label: "New Folder", shortcut: "Meta+N" },
          { label: "Open", shortcut: "Meta+O", disabled: true },
          { label: "Print", shortcut: "Meta+P", disabled: true },
          { label: "Close Window", shortcut: "Meta+W" },
          { label: "Get Info", shortcut: "Meta+I", separator: true },
          { label: "Sharing..." },
          { label: "Duplicate", shortcut: "Meta+D" },
          { label: "Make Alias" },
          { label: "Put Away", shortcut: "Meta+Y", disabled: true },
          { label: "Find", shortcut: "Meta+F", separator: true },
          { label: "Find Again", shortcut: "Meta+G" },
          { label: "Page Setup...", separator: true },
          { label: "Print Window" },
        ],
      },
      { label: "Edit", items: [{ label: "Undo" }, { label: "Redo" }] },
    ],
  },
  Dialog: {
    open: true,
    title: "Preview window",
    titlebarActions: null,
    bounds: { x: 42, y: 36, width: 320, height: 220 },
    sceneBounds: { x: 0, y: 0, width: 500, height: 320 },
    defaultBounds: { x: 42, y: 36, width: 320, height: 220 },
  },
  Popover: {
    open: true,
    label: "Preview popup",
    bounds: { x: 42, y: 36, width: 240, height: 180 },
    sceneBounds: { x: 0, y: 0, width: 500, height: 320 },
    autoFocus: false,
    closeOnOutsideClick: false,
  },
  Divider: {
    bounds: { x: 0, y: 0, width: 240, height: 24 },
    text: "Section label",
  },
  Input: {
    pixelWidth: undefined,
    bounds: { x: 0, y: 0, width: 170, height: 22 },
    value: "Brush size",
    size: 16,
    leading: { [GALLERY_ICON_KEY]: "icon_search" },
    suffix: "px",
    part: "sunken_normal",
    focusedPart: "sunken_focused",
    textInset: 8,
    frameScaleTop: undefined,
    pixelSize: undefined,
  },
  ListBox: {
    frameStyle: undefined,
    framed: true,
    scrollbarVariant: undefined,
    bounds: { x: 0, y: 0, width: 220, height: 160 },
    viewport: undefined,
    font: undefined,
    items: [
      { value: "brush", label: "Brush" },
      { value: "pencil", label: "Pencil" },
      { separator: true },
      { value: "eraser", label: "Eraser" },
    ],
    value: "brush",
    values: ["brush"],
    "aria-label": "Tools",
    itemHeight: 18,
    separatorHeight: 8,
    selectionMode: "single",
    sectionHeight: undefined,
    headingHeight: undefined,
    renderItem: undefined,
    renderGroup: undefined,
  },
  Radio: {
    label: "Brush tool",
    checked: true,
    bounds: { x: 0, y: 0, width: 160, height: 32 },
  },
  Scrollbar: {
    orientation: "vertical",
    bounds: { x: 0, y: 0, width: 16, height: 120 },
    contentSize: 240,
    visibleSize: 80,
    value: 48,
  },
  Slider: {
    variant: "normal",
    value: 48,
    min: 0,
    max: 100,
    bounds: { x: 0, y: 0, width: 220, height: 32 },
    "aria-label": "Brush size",
    label: undefined,
    valueFormat: "integer",
    step: 1,
    paintBackground: undefined,
  },
  Tabs: {
    tabs: [
      {
        id: "home",
        label: "Home",
        icon: { active: "tab_home_icon_active", inactive: "tab_home_icon_normal" },
        translateLabel: true,
        closable: false,
      },
      { id: "canvas", label: "Canvas", modified: true, closable: true },
      { id: "palette", label: "Palette", closable: true },
    ],
    value: "canvas",
    width: 560,
    onValueChange: { [GALLERY_CALLBACK_KEY]: "onValueChange" },
    onClose: { [GALLERY_CALLBACK_KEY]: "onClose" },
    onReorder: { [GALLERY_CALLBACK_KEY]: "onReorder" },
    ariaLabel: "Gallery document tabs",
    tabListLabel: "Documents",
    leadingContent: null,
    trailingContent: null,
    children: null,
    className: undefined,
  },
  Text: {
    variant: "inline",
    text: "Pixel aligned text",
    children: "Pixel aligned text",
    bounds: { x: 0, y: 0, width: 200, height: 28 },
    x: 0,
    y: 0,
    pixelSize: undefined,
    fill: undefined,
    scale: 2,
    color: undefined,
    ink: undefined,
  },
  RichText: {
    children: "A short note about an animation project.",
    markdown:
      "# A pixel notebook\n\nRead **bold labels**, `inline code` and [a link](/editor).\n\n- First item\n- Second item",
  },
  TextArea: {
    scrollbarVariant: undefined,
    defaultValue: "Frame notes\nKeep the outline crisp.",
    value: undefined,
    children: undefined,
    rows: 4,
  },
  ScrollArea: {
    scrollX: false,
    scrollY: true,
    scrollbarVariant: undefined,
    style: { width: 280, height: 96 },
    children: "Frame 01\nFrame 02\nFrame 03\nFrame 04\nFrame 05\nFrame 06\nFrame 07\nFrame 08",
  },
  Tooltip: {
    children: "Help",
    text: "Balloon help\n\nText goes here. There\nis no formatting.",
    placement: "top-left",
    maxWidth: undefined,
    targetBounds: undefined,
  },
};

const previewDescriptions = {
  RichText:
    "Use markdown for Markdown source, or clear it to preview JSX children. These are two content inputs of the same component.",
  Tabs: "Xprite tabs with selection, close, and reorder behavior.",
  Text: "Inline, reading, pixel-positioned and theme-aligned control text.",
  Note: "Paper colors and window controls, with removal or collapse on close.",
  Panel: "Standard, window and titled group frames with action and content slots.",
  ListBox: "Single or multiple selection with grouped rows and custom content slots.",
};

const previewKinds = {
  Tabs: "themed-tabs",
};

const configPath = resolve(uiRoot, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));

const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, uiRoot);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const entrySource = program.getSourceFile(entryPath);
const entrySymbol = entrySource && checker.getSymbolAtLocation(entrySource);
if (!entrySymbol)
  throw new Error("Unable to read the public exports from packages/ui/src/components/index.ts");

const isUiDeclaration = (declaration) =>
  declaration?.getSourceFile().fileName.includes("packages/ui/src/");

function resolveExport(symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function componentSignature(symbol) {
  const resolved = resolveExport(symbol);
  const location = resolved.valueDeclaration ?? resolved.declarations?.[0] ?? entrySource;
  const componentType = checker.getTypeOfSymbolAtLocation(resolved, location);
  const signatures = checker.getSignaturesOfType(componentType, ts.SignatureKind.Call);
  const signature = signatures[0];
  if (!signature) return null;

  const returnType = checker.typeToString(signature.getReturnType());
  const isForwardRef = checker.typeToString(componentType).startsWith("ForwardRefExoticComponent<");
  return /\b(?:Element|ReactElement)\b/.test(returnType) || isForwardRef
    ? { resolved, componentType, signature, signatures }
    : null;
}

function normalizedTypes(type) {
  const nonNullable = checker.getNonNullableType(type);
  return nonNullable.isUnion() ? nonNullable.types : [nonNullable];
}

function getEnumOptions(type) {
  const options = [];
  const candidates = normalizedTypes(type);
  for (const candidate of candidates) {
    if (candidate.flags & ts.TypeFlags.StringLiteral) options.push(candidate.value);
    else if (candidate.flags & ts.TypeFlags.NumberLiteral) options.push(candidate.value);
    else if (candidate.flags & ts.TypeFlags.EnumLiteral) {
      const member = candidate.symbol?.valueDeclaration;
      const value = member && checker.getConstantValue(member);
      if (value !== undefined) options.push(value);
      else return null;
    } else {
      const enumDeclaration = (candidate.aliasSymbol ?? candidate.symbol)?.declarations?.find(
        (declaration) => ts.isEnumDeclaration(declaration),
      );
      if (!enumDeclaration) return null;
      for (const member of enumDeclaration.members) {
        const value = checker.getConstantValue(member);
        if (value !== undefined) options.push(value);
      }
    }
  }
  return options.length > 0 ? [...new Set(options)] : null;
}

function propertySchema(name, type, required) {
  const normalized = checker.getNonNullableType(type);
  const typeText = checker.typeToString(type).replace(/\s+/g, " ").slice(0, 100);
  const renderedType = checker.typeToString(normalized);
  const options = getEnumOptions(normalized);
  const isCallable = normalizedTypes(normalized).some(
    (candidate) => checker.getSignaturesOfType(candidate, ts.SignatureKind.Call).length > 0,
  );

  let kind = "json";
  if (name === "children") kind = normalized.flags & ts.TypeFlags.StringLike ? "string" : "node";
  else if (name === "titlebarActions") kind = "node";
  else if (isCallable) kind = "callback";
  else if (renderedType.includes("ReactNode")) kind = "node";
  else if (options && options.length <= MAX_ENUM_OPTIONS) kind = "enum";
  else if (checker.isArrayType(normalized) || checker.isTupleType(normalized)) kind = "array";
  else if (normalized.flags & ts.TypeFlags.BooleanLike) kind = "boolean";
  else if (normalized.flags & ts.TypeFlags.NumberLike) kind = "number";
  else if (normalized.flags & ts.TypeFlags.StringLike) kind = "string";
  else if (options) kind = "string";

  return { name, kind, required, type: typeText, options: kind === "enum" ? options : undefined };
}

function sampleScalar(name, componentName, kind, options, parentName) {
  if (kind === "callback") return { [GALLERY_CALLBACK_KEY]: name };
  if (kind === "node") return "Gallery content";
  if (kind === "enum") {
    if (name === "part") return "window";
    if (name === "icon" || name.endsWith("Icon")) return "window_play_icon";
    if (name === "variant" && componentName === "Overlay") return "window";
    if (name === "variant" && componentName === "Checkbox") return "checkbox";
    if (name === "variant" && componentName === "Slider") return "normal";
    return options[0];
  }
  if (kind === "string") {
    if (name === "value" && componentName === "Combobox") return "normal";
    if (name === "value" && componentName === "Tabs") return "canvas";
    if (name === "part" || name.endsWith("Part")) return "window";
    if (name === "icon" || name.endsWith("Icon")) return "window_play_icon";
    if (name === "text" || name === "label" || name === "title") return `Gallery ${name}`;
    if (name === "aria-label" || name === "ariaLabel") return "Gallery control";
    if (name === "description") return "A UI component preview";
    if (name === "id") return "gallery-item";
    if (name === "shortcut") return "Ctrl+Z";
    if (name === "context") return "Canvas";
    if (name === "language") return "en";
    if (name === "suffix") return "px";
    if (name === "font") return "default";
    if (name === "cursor") return "grab";
    if (name === "color" || name === "fill" || name.endsWith("Color")) return "#ffbf69";
    return "Sample";
  }
  if (kind === "number") {
    if (name === "width") return parentName === "viewport" ? 2 : 160;
    if (name === "height") return parentName === "viewport" ? 2 : 40;
    if (name === "sceneWidth" || name === "sceneHeight") return 2;
    if (name === "max") return 100;
    if (name === "value") return 48;
    if (name === "visibleSize") return 40;
    if (name === "contentSize") return 120;
    if (name === "selectionEnd") return 5;
    if (name === "scale" || name.endsWith("Scale")) return 1;
    if (name === "rasterScale") return 2;
    if (name === "delay") return 250;
    if (name === "itemWidth") return 18;
    if (name === "maxLength") return 64;
    return 0;
  }
  if (kind === "boolean") {
    if (["open", "checked", "selected", "enabled", "drawCenter"].includes(name)) return true;
    return false;
  }
  if (kind === "array") {
    if (name === "dependencies" || name === "items" || name === "options" || name === "tabs")
      return [];
    if (name === "panButtons") return [1, 2, 3];
    return [];
  }
  if (kind === "object") return {};
  return null;
}

function sampleValue(name, componentName, type, depth = 0, parentName = "") {
  const schema = propertySchema(name, type, false);
  const scalar = sampleScalar(name, componentName, schema.kind, schema.options, parentName);
  if (schema.kind !== "json") return scalar;

  const normalized = checker.getNonNullableType(type);
  if (name === "cursor") return { hand: "grab", dragging: "grabbing" };
  if (name === "coordinateScale") return { x: 1, y: 1 };
  if (name === "viewport") return { sceneWidth: 2, sceneHeight: 2, width: 2, height: 2 };
  if (checker.isArrayType(normalized) || checker.isTupleType(normalized)) {
    if (name === "dependencies" || name === "items" || name === "options" || name === "tabs") {
      if (componentName === "Combobox" && name === "options")
        return [
          { value: "normal", label: "Normal" },
          { value: "multiply", label: "Multiply" },
          { value: "screen", label: "Screen" },
        ];
      if (name === "tabs")
        return [
          { id: "canvas", label: "Canvas", closable: true },
          { id: "palette", label: "Palette", closable: true },
        ];
      if (name === "items") return [{ label: "Sample action" }, { label: "Another action" }];
      return [];
    }
    const argumentsList = checker.getTypeArguments(normalized);
    const elementType = argumentsList[0];
    if (!elementType) return [];
    const isTuple = checker.isTupleType(normalized);
    const tupleCount = isTuple ? argumentsList.length : 1;
    return Array.from({ length: tupleCount }, (_, index) =>
      sampleValue(
        name === "labels" ? "label" : name,
        componentName,
        argumentsList[index] ?? elementType,
        depth + 1,
      ),
    );
  }

  if (depth >= MAX_SAMPLE_DEPTH) return {};
  const properties = checker
    .getPropertiesOfType(normalized)
    .filter((property) => property.declarations?.some(isUiDeclaration));
  if (properties.length === 0) return {};

  const sample = {};
  for (const property of properties) {
    if (property.name === "ref" || property.name === "key") continue;
    const location = property.valueDeclaration ?? property.declarations?.[0] ?? entrySource;
    sample[property.name] = sampleValue(
      property.name,
      componentName,
      checker.getTypeOfSymbolAtLocation(property, location),
      depth + 1,
      name,
    );
  }
  return sample;
}

function componentProps(symbol, signatures, componentName) {
  const parameter = signatures[0].getParameters()[0];
  if (!parameter) return { schemas: [], initialProps: {} };

  const location = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? entrySource;
  const propsType = checker.getUnionType(
    signatures.map((signature) => {
      const parameter = signature.getParameters()[0];
      const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0] ?? entrySource;
      return checker.getTypeOfSymbolAtLocation(parameter, declaration);
    }),
  );
  const candidates = propsType.isUnion() ? propsType.types : [propsType];
  const propertyMap = new Map();
  for (const candidate of candidates) {
    for (const property of checker.getPropertiesOfType(candidate)) {
      if (property.name === "key" || property.name === "ref") continue;
      const previous = propertyMap.get(property.name) ?? [];
      propertyMap.set(property.name, [...previous, property]);
    }
  }

  const schemas = [];
  const initialProps = {};
  for (const [name, properties] of propertyMap) {
    if (componentName === "Input" && name === "children") continue;
    const propertyTypes = properties.map((property) => {
      const propertyLocation = property.valueDeclaration ?? property.declarations?.[0] ?? location;
      return checker.getTypeOfSymbolAtLocation(property, propertyLocation);
    });
    const type =
      propertyTypes.length === 1 ? propertyTypes[0] : checker.getUnionType(propertyTypes);
    const required = candidates.every((candidate) => {
      const property = candidate.getProperty(name);
      return property && !(property.flags & ts.SymbolFlags.Optional);
    });
    const schema = propertySchema(name, type, required);
    schema.hostProp =
      name !== "children" &&
      !properties.some((property) => property.declarations?.some(isUiDeclaration));
    schemas.push(schema);
    if (required) initialProps[name] = sampleValue(name, componentName, type);
  }

  Object.assign(initialProps, sampleOverrides[componentName] ?? {});
  return { schemas, initialProps };
}

const publicExports = new Map(
  checker.getExportsOfModule(entrySymbol).map((symbol) => [symbol.name, symbol]),
);
const components = Object.entries(COMPONENT_GROUPS).flatMap(([group, names]) =>
  names.map((name) => {
    const symbol = publicExports.get(name);
    if (!symbol) throw new Error(`Gallery component ${name} is not publicly exported`);
    const signature = componentSignature(symbol);
    if (!signature) throw new Error(`Gallery component ${name} has no React signature`);
    const { schemas, initialProps } = componentProps(symbol, signature.signatures, name);
    return {
      name,
      group,
      schemas,
      initialProps,
      description: previewDescriptions[name],
      previewKind: previewKinds[name],
      previewProperty: PREVIEW_PROPERTIES[name],
    };
  }),
);

const imports = `import {\n${components.map(({ name }) => `  ${name},`).join("\n")}\n} from "@xprite/ui";`;
const data = components
  .map(({ name, group, schemas, initialProps, description, previewKind, previewProperty }) => {
    const serializedSchemas = JSON.stringify(schemas, null, 2).replace(/^/gm, "    ");
    const serializedProps = JSON.stringify(initialProps, null, 2).replace(/^/gm, "    ");
    const serializedDescription = description
      ? `\n    description: ${JSON.stringify(description)},`
      : "";
    const serializedPreviewProperty = previewProperty
      ? `\n    previewProperty: ${JSON.stringify(previewProperty)},`
      : "";
    const serializedPreviewKind = previewKind
      ? `\n    previewKind: ${JSON.stringify(previewKind)},`
      : "";
    return `  {\n    name: ${JSON.stringify(name)},\n    group: GalleryComponentGroup.${group},\n    component: ${name} as unknown as ComponentType<Record<string, unknown>>,\n    props: ${serializedSchemas},\n    initialProps: ${serializedProps},${serializedDescription}${serializedPreviewKind}${serializedPreviewProperty}\n  },`;
  })
  .join("\n");

const output = `// Generated from the public React components and prop types in packages/ui/src/components/index.ts.\n// Run pnpm gallery:generate to refresh.\nimport type { ComponentType } from "react";\n${imports}\n\nexport interface GalleryPropSchema {\n  name: string;\n  kind: "string" | "number" | "boolean" | "enum" | "array" | "callback" | "node" | "json";\n  required: boolean;\n  hostProp: boolean;\n  type: string;\n  options?: readonly (string | number)[];\n}\n\nexport enum GalleryComponentGroup {\n  Controls = "Controls",\n  Typography = "Typography",\n  Containers = "Containers",\n  Navigation = "Navigation",\n  Overlays = "Overlays",\n  Media = "Media",\n}\n\nexport interface GalleryComponentDefinition {\n  group: GalleryComponentGroup;\n  previewProperty?: string;\n  name: string;\n  component: ComponentType<Record<string, unknown>>;\n  props: readonly GalleryPropSchema[];\n  initialProps: Record<string, unknown>;\n  description?: string;\n  previewKind?: string;\n}\n\nexport const generatedUIComponents: readonly GalleryComponentDefinition[] = [\n${data}\n];\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
await mkdir(dirname(routesPath), { recursive: true });
await writeFile(
  routesPath,
  `${JSON.stringify(
    [
      "/components/",
      "/components/icons",
      ...components.map(
        ({ name }) => `/components/${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`,
      ),
    ],
    null,
    2,
  )}\n`,
);
execFileSync("pnpm", ["exec", "oxfmt", "--config", "infra/oxfmt.json", "--write", outputPath], {
  cwd: repositoryRoot,
  stdio: "ignore",
});
console.log(`Generated Gallery entries for ${components.length} public UI components.`);
