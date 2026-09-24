import { browserCommandAction } from "$/managers/menus/shortcut-availability";
import { ShortcutBindingKind, type ShortcutDragVector } from "$/managers/ports/shortcut-files";
import { normalizeShortcut, shortcutToInput } from "$/managers/shortcuts/shortcut-input";
import toolTips from "$assets/commands/aseprite-tool-tips.json";
import shortcutCatalog from "$assets/commands/libresprite-keyboard-shortcuts.json";
import mainMenu from "$assets/commands/libresprite-main-menu.json";
import { resolveShortcut, type EditorCommand, type EditorTool } from "@xprite/editor-core";

export { ShortcutBindingKind };
export type ShortcutOverrides = Readonly<Record<string, readonly string[] | ShortcutDragVector>>;
export enum ShortcutDragAction {
  BrushSize = "BrushSize",
}
export enum ShortcutSectionId {
  Menus = "menus",
  Commands = "commands",
  Tools = "tools",
  Actions = "actions",
  Wheel = "wheel",
  Drag = "drag",
}
export interface ShortcutDefinition {
  key: string;
  kind: ShortcutBindingKind;
  id: string;
  label: string;
  context: string;
  params?: Record<string, string>;
  defaults: readonly string[];
  command?: EditorCommand;
  vector?: ShortcutDragVector;
}
export interface ShortcutMenuItem {
  definitionKey: string;
  label: string;
  path: string;
  depth: number;
}
interface CatalogEntry {
  id: string;
  shortcut: string;
  context: string;
  params?: Record<string, string>;
}
interface MenuNode {
  kind?: string;
  label?: string;
  command?: string;
  params?: Record<string, string>;
  shortcut?: string;
  shortcutBindingContext?: string;
  children?: MenuNode[];
}

export function shortcutIdentity(
  kind: ShortcutBindingKind,
  id: string,
  context = "Any",
  params?: Record<string, string>,
) {
  return JSON.stringify([
    kind,
    id,
    context.replace(/\s+/g, ""),
    Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
function humanizeShortcut(id: string) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

const toolIds: Readonly<Record<string, EditorTool>> = {
  rectangular_marquee: "marquee",
  paint_bucket: "bucket",
};
const bindings = shortcutCatalog as {
  commands: CatalogEntry[];
  tools: CatalogEntry[];
  actions: CatalogEntry[];
};
const labels = (toolTips as { tools: Record<string, { label: string }> }).tools;
const definitions = new Map<string, ShortcutDefinition>();
const menuItems: ShortcutMenuItem[] = [];

function add(
  kind: ShortcutBindingKind,
  entry: CatalogEntry,
  label?: string,
  command?: EditorCommand,
) {
  const key = shortcutIdentity(kind, entry.id, entry.context, entry.params);
  const shortcut = normalizeShortcut(
    entry.shortcut,
    kind !== ShortcutBindingKind.Command && kind !== ShortcutBindingKind.Tool,
    kind !== ShortcutBindingKind.Wheel,
  );
  const existing = definitions.get(key);
  if (existing) {
    if (shortcut !== null && !existing.defaults.includes(shortcut))
      existing.defaults = [...existing.defaults, shortcut];
    if (label) existing.label = label;
    return key;
  }
  definitions.set(key, {
    key,
    kind,
    id: entry.id,
    label: label ?? humanizeShortcut(entry.id),
    context: entry.context,
    params: entry.params,
    defaults:
      shortcut === null || (shortcut === "" && kind !== ShortcutBindingKind.Wheel)
        ? []
        : [shortcut],
    command,
  });
  return key;
}

for (const entry of bindings.commands) {
  const shortcut = normalizeShortcut(entry.shortcut);
  const command = shortcut ? resolveShortcut(shortcutToInput(shortcut)) : null;
  const action = browserCommandAction(entry.id, entry.params);
  if (command && action && command.type === action)
    add(ShortcutBindingKind.Command, entry, undefined, command);
}
for (const entry of bindings.tools) {
  const shortcut = normalizeShortcut(entry.shortcut);
  const command = shortcut ? resolveShortcut(shortcutToInput(shortcut)) : null;
  if (command?.type === "tool")
    add(ShortcutBindingKind.Tool, entry, labels[entry.id]?.label, {
      type: "tool",
      tool: toolIds[entry.id] ?? (entry.id as EditorTool),
    });
}
for (const entry of [...definitions.values()].filter(
  (entry) => entry.kind === ShortcutBindingKind.Tool,
)) {
  const defaults: Readonly<Record<string, string>> = {
    eyedropper: "Alt",
    move: "Ctrl",
    hand: "Space",
  };
  add(
    ShortcutBindingKind.QuickTool,
    { id: entry.id, context: "Any", shortcut: defaults[entry.id] ?? "" },
    entry.label,
    entry.command,
  );
}
for (const entry of bindings.actions) add(ShortcutBindingKind.Action, entry);

const extraActions: CatalogEntry[] = [
  { id: "CornerRadius", shortcut: "C", context: "Shape" },
  { id: "FineControl", shortcut: "Ctrl", context: "Selection Transform" },
  { id: "ScaleFromCenter", shortcut: "Alt", context: "Scaling Selection" },
  { id: "SnapToGrid", shortcut: "Alt", context: "Translating Selection" },
  { id: "AngleSnapFromLastPoint", shortcut: "Ctrl", context: "Freehand" },
];
for (const entry of extraActions) add(ShortcutBindingKind.Action, entry);

const extraCommands: Array<CatalogEntry & { label: string; command: EditorCommand }> = [
  ...["+", "Shift++", "Shift+="].map((shortcut) => ({
    id: "ChangeBrush",
    params: { change: "increment-size" },
    shortcut,
    context: "Any",
    label: "Increase Brush Size",
    command: { type: "brush-grow" } as EditorCommand,
  })),
  {
    id: "Timeline",
    params: { switch: "true" },
    shortcut: "Tab",
    context: "Any",
    label: "Timeline",
    command: { type: "toggle-timeline" },
  },
  {
    id: "ToggleTimelineThumbnails",
    shortcut: "F6",
    context: "Any",
    label: "Timeline Thumbnails",
    command: { type: "toggle-timeline-thumbnails" },
  },
  {
    id: "ChangeColor",
    params: { target: "foreground", change: "decrement-index" },
    shortcut: "9",
    context: "Any",
    label: "Previous Palette Color",
    command: { type: "palette-previous" },
  },
  {
    id: "ChangeColor",
    params: { target: "foreground", change: "increment-index" },
    shortcut: "0",
    context: "Any",
    label: "Next Palette Color",
    command: { type: "palette-next" },
  },
  {
    id: "ChangeColor",
    params: { target: "foreground", change: "decrement-index" },
    shortcut: "[",
    context: "Any",
    label: "Previous Palette Color",
    command: { type: "palette-previous" },
  },
  {
    id: "ChangeColor",
    params: { target: "foreground", change: "increment-index" },
    shortcut: "]",
    context: "Any",
    label: "Next Palette Color",
    command: { type: "palette-next" },
  },
  {
    id: "Zoom",
    params: { action: "in" },
    shortcut: "Ctrl++",
    context: "Any",
    label: "Zoom In",
    command: { type: "zoom-in" },
  },
  ...["Ctrl+=", "Ctrl+Shift++", "Ctrl+Shift+="].map((shortcut) => ({
    id: "Zoom",
    params: { action: "in" },
    shortcut,
    context: "Any",
    label: "Zoom In",
    command: { type: "zoom-in" } as EditorCommand,
  })),
  {
    id: "Zoom",
    params: { action: "out" },
    shortcut: "Ctrl+-",
    context: "Any",
    label: "Zoom Out",
    command: { type: "zoom-out" },
  },
  {
    id: "FitScreen",
    shortcut: "Ctrl+0",
    context: "Any",
    label: "Fit Sprite to Screen",
    command: { type: "fit-screen" },
  },
  {
    id: "ScrollCenter",
    shortcut: "Shift+Z",
    context: "Any",
    label: "Center Sprite",
    command: { type: "scroll-center" },
  },
];
for (const entry of extraCommands)
  add(ShortcutBindingKind.Command, entry, entry.label, entry.command);

// Browsers can reserve the native Control+Tab/Page keys. Alt+Page keys provide
// an in-page default while retaining editable native bindings where delivered.
for (const [id, label, shortcuts] of [
  ["GotoNextTab", "Next Tab", ["Ctrl+Tab", "Ctrl+PageDown", "Alt+PageDown"]],
  ["GotoPreviousTab", "Previous Tab", ["Ctrl+Shift+Tab", "Ctrl+PageUp", "Alt+PageUp"]],
] as const) {
  for (const shortcut of shortcuts)
    add(ShortcutBindingKind.Command, { id, shortcut, context: "Any" }, label);
}

function visit(nodes: readonly MenuNode[], path: string[] = []) {
  for (const node of nodes) {
    const label = node.label ?? "";
    if (node.command) {
      let definition = [...definitions.values()].find(
        (candidate) =>
          candidate.kind === ShortcutBindingKind.Command &&
          candidate.id === node.command &&
          JSON.stringify(candidate.params ?? {}) === JSON.stringify(node.params ?? {}),
      );
      if (!definition) {
        const action = browserCommandAction(node.command, node.params);
        const shortcut = node.shortcut ? normalizeShortcut(node.shortcut) : null;
        const command = shortcut ? resolveShortcut(shortcutToInput(shortcut)) : null;
        const key = add(
          ShortcutBindingKind.Command,
          {
            id: node.command,
            params: node.params,
            shortcut: node.shortcut ?? "",
            context: node.shortcutBindingContext ?? "Any",
          },
          label.replace(/\.\.\.$/, ""),
          action && command?.type === action ? command : undefined,
        );
        definition = definitions.get(key);
      }
      if (definition) {
        if (!definition.params || !Object.keys(definition.params).length)
          definition.label = label.replace(/\.\.\.$/, "");
        menuItems.push({
          definitionKey: definition.key,
          label,
          path: [...path, label].join(" > "),
          depth: path.length,
        });
      }
    }
    if (node.children) visit(node.children, node.kind === "menu" ? [...path, label] : path);
  }
}
visit((mainMenu as { menus: MenuNode[] }).menus);

const wheelDefinitions = [
  ["Zoom", "Zoom", ""],
  ["HScroll", "Horizontal Scroll", "Shift"],
  ["FgColor", "Foreground Color", "Alt"],
  ["BgColor", "Background Color", "Alt+Shift"],
  ["BrushSize", "Brush Size", "Ctrl"],
  ["Frame", "Frame", "Ctrl+Shift"],
] as const;
for (const [id, label, shortcut] of wheelDefinitions)
  add(ShortcutBindingKind.Wheel, { id, context: "Any", shortcut }, label);

const brushDragKey = add(
  ShortcutBindingKind.Drag,
  { id: ShortcutDragAction.BrushSize, context: "Any", shortcut: "Ctrl+Alt" },
  "Brush Size",
);
definitions.get(brushDragKey)!.vector = { x: 4, y: 0 };

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [...definitions.values()];
export const SHORTCUT_MENU_ITEMS: readonly ShortcutMenuItem[] = menuItems;
