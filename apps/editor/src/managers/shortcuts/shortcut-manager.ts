import {
  EditorWheelAction,
  EditorWheelInputKind,
  EditorPrimaryModifier,
  type EditorWheelPolicyInput,
  type PreferenceStoragePort,
} from "$/managers/ports/platform";
import {
  ShortcutBindingKind,
  type ShortcutFileEntry,
  type ShortcutFilePort,
  type ShortcutDragVector,
} from "$/managers/ports/shortcut-files";
import {
  SHORTCUT_DEFINITIONS,
  shortcutIdentity,
  ShortcutDragAction,
  type ShortcutDefinition,
  type ShortcutOverrides,
} from "$/managers/shortcuts/shortcut-catalog";
import {
  normalizeShortcut,
  shortcutMatches,
  shortcutToInput,
} from "$/managers/shortcuts/shortcut-input";
import { defaultShortcutBindings } from "$/managers/shortcuts/shortcut-platform";
import type { EditorCommand, EditorTool, ShortcutInput } from "@xprite/editor-core";

export {
  SHORTCUT_DEFINITIONS,
  SHORTCUT_MENU_ITEMS,
  ShortcutSectionId,
  ShortcutDragAction,
  ShortcutBindingKind,
} from "$/managers/shortcuts/shortcut-catalog";
export type { ShortcutDefinition, ShortcutOverrides } from "$/managers/shortcuts/shortcut-catalog";
export { inputToShortcut, normalizeShortcut } from "$/managers/shortcuts/shortcut-input";

export type { ShortcutDragVector } from "$/managers/ports/shortcut-files";
export interface ResolvedShortcutDragAction {
  id: ShortcutDragAction;
  definitionKey: string;
  binding: string;
  vector: ShortcutDragVector;
}

const dragVectorIdentity = (definition: ShortcutDefinition) =>
  JSON.stringify(["drag-vector", definition.key]);
const hasCommand = (definition: ShortcutDefinition) =>
  (definition.kind === ShortcutBindingKind.Command ||
    definition.kind === ShortcutBindingKind.Tool) &&
  !!definition.command;
const isModifierBinding = (definition: ShortcutDefinition) =>
  definition.kind !== ShortcutBindingKind.Command && definition.kind !== ShortcutBindingKind.Tool;
const allowsHeldKey = (definition: ShortcutDefinition) =>
  isModifierBinding(definition) && definition.kind !== ShortcutBindingKind.Wheel;
const isVector = (value: unknown): value is ShortcutDragVector => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const vector = value as ShortcutDragVector;
  return Number.isFinite(vector.x) && Number.isFinite(vector.y);
};

const STORAGE_KEY = "xse.workspace.keyboard-shortcuts.v1";
enum ModifierKey {
  Control = "control",
  Meta = "meta",
  Alt = "alt",
  Shift = "shift",
}
const MODIFIER_KEYS = new Set<string>(Object.values(ModifierKey));
const WHEEL_ACTIONS: Readonly<Record<string, EditorWheelAction>> = {
  Zoom: EditorWheelAction.Zoom,
  HScroll: EditorWheelAction.Horizontal,
  VScroll: EditorWheelAction.Vertical,
  FgColor: EditorWheelAction.Foreground,
  BgColor: EditorWheelAction.Background,
  BrushSize: EditorWheelAction.Brush,
  Frame: EditorWheelAction.Frame,
};
const canonicalContext = (value: string) => value.replace(/\s+|\//g, "").toLowerCase();
const overlaps = (a: string, b: string) =>
  a === "Any" || b === "Any" || canonicalContext(a) === canonicalContext(b);
const activeContext = (definition: ShortcutDefinition, context: string) =>
  definition.context === "Any" ||
  canonicalContext(definition.context) === canonicalContext(context);

export class ShortcutManager {
  private overrides: ShortcutOverrides = {};
  private readonly listeners = new Set<() => void>();
  private readonly menuCommands = new Map<
    string,
    Set<{ execute(): void; canExecute(): boolean }>
  >();
  private readonly pressedKeys = new Set<string>();

  constructor(
    private readonly storage: PreferenceStoragePort,
    private readonly files?: ShortcutFilePort,
    private readonly primaryModifier = EditorPrimaryModifier.Control,
  ) {
    try {
      this.overrides = this.normalizeOverrides(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
    } catch {
      /* Use source defaults when preferences are unavailable. */
    }
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.overrides;
  registerMenuCommand(
    definitionKey: string,
    capability: { execute(): void; canExecute(): boolean },
  ) {
    const registrations =
      this.menuCommands.get(definitionKey) ?? new Set<{ execute(): void; canExecute(): boolean }>();
    const existing = registrations.size > 0;
    registrations.add(capability);
    this.menuCommands.set(definitionKey, registrations);
    if (!existing) this.notifyAvailability();
    return () => {
      registrations.delete(capability);
      if (registrations.size) return;
      this.menuCommands.delete(definitionKey);
      this.notifyAvailability();
    };
  }
  private notifyAvailability() {
    this.overrides = { ...this.overrides };
    for (const listener of this.listeners) listener();
  }
  isAvailable(definition: ShortcutDefinition) {
    return (
      definition.kind !== ShortcutBindingKind.Command ||
      !!definition.command ||
      this.menuCommands.has(definition.key)
    );
  }
  executeMenuShortcut(
    input: ShortcutInput,
    context = "Normal",
    actionContexts: readonly string[] = [],
  ): boolean {
    if (
      input.editingText ||
      this.isActionInput(input, actionContexts) ||
      this.isHeldShortcutInput(input)
    )
      return false;
    const definition = SHORTCUT_DEFINITIONS.find(
      (entry) =>
        !entry.command &&
        entry.kind === ShortcutBindingKind.Command &&
        activeContext(entry, context) &&
        this.menuCommands.has(entry.key) &&
        this.bindings(entry).some((binding) => shortcutMatches(binding, input)),
    );
    const capabilities = definition && this.menuCommands.get(definition.key);
    if (!capabilities?.size) return false;
    const capability = [...capabilities].find((candidate) => candidate.canExecute());
    capability?.execute();
    return true;
  }
  get fileActionsAvailable() {
    return !!this.files;
  }
  beginDraft(): ShortcutOverrides {
    return { ...this.overrides };
  }
  bindings(
    definition: ShortcutDefinition,
    overrides: ShortcutOverrides = this.overrides,
  ): readonly string[] {
    const value = overrides[definition.key];
    return Array.isArray(value) ? value : defaultShortcutBindings(definition, this.primaryModifier);
  }
  private normalizeOverrides(value: unknown): ShortcutOverrides {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, readonly string[] | ShortcutDragVector> = {};
    for (const definition of SHORTCUT_DEFINITIONS) {
      if (definition.kind === ShortcutBindingKind.Drag) {
        const vectorKey = dragVectorIdentity(definition);
        const vector = (value as Record<string, unknown>)[vectorKey];
        if (isVector(vector)) result[vectorKey] = { x: vector.x, y: vector.y };
      }
      const bindings = (value as Record<string, unknown>)[definition.key];
      if (!Array.isArray(bindings)) continue;
      const normalized: string[] = [];
      for (const binding of bindings) {
        if (typeof binding !== "string") continue;
        const shortcut = this.normalizeBinding(definition, binding);
        if (shortcut !== null && !normalized.includes(shortcut)) normalized.push(shortcut);
      }
      result[definition.key] = normalized;
    }
    return result;
  }
  normalizeBinding(definition: ShortcutDefinition, value: string): string | null {
    const normalized = normalizeShortcut(
      value,
      isModifierBinding(definition),
      allowsHeldKey(definition),
    );
    return normalized === "" && allowsHeldKey(definition) ? null : normalized;
  }
  apply(draft: ShortcutOverrides) {
    this.overrides = this.normalizeOverrides(draft);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.overrides));
    } catch {
      /* Keep the new bindings for the current workspace when storage is unavailable. */
    }
    for (const listener of this.listeners) listener();
  }
  update(
    draft: ShortcutOverrides,
    definitionKey: string,
    bindings: readonly string[],
  ): ShortcutOverrides {
    const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.key === definitionKey);
    if (!definition) return draft;
    const normalized = bindings.map((binding) => this.normalizeBinding(definition, binding));
    if (normalized.some((binding) => binding === null))
      throw new Error("Invalid keyboard shortcut.");
    const next = { ...draft, [definitionKey]: [...new Set(normalized as string[])] };
    if (JSON.stringify(next[definitionKey]) === JSON.stringify(this.bindings(definition, {})))
      delete next[definitionKey];
    return next;
  }
  reset(draft: ShortcutOverrides, definitionKey?: string): ShortcutOverrides {
    if (!definitionKey) return {};
    const next = { ...draft };
    delete next[definitionKey];
    const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.key === definitionKey);
    if (definition?.kind === ShortcutBindingKind.Drag) delete next[dragVectorIdentity(definition)];
    return next;
  }
  private sameBinding(definition: ShortcutDefinition, a: string, b: string): boolean {
    if (!a || !b) return a === b;
    const modifiersOnly = isModifierBinding(definition);
    if (
      allowsHeldKey(definition) &&
      shortcutToInput(a).key.toLowerCase() !== shortcutToInput(b).key.toLowerCase()
    )
      return false;
    return shortcutMatches(a, shortcutToInput(b, modifiersOnly), modifiersOnly);
  }
  conflicts(
    definition: ShortcutDefinition,
    shortcut: string,
    draft: ShortcutOverrides,
  ): readonly ShortcutDefinition[] {
    return SHORTCUT_DEFINITIONS.filter(
      (other) =>
        other.key !== definition.key &&
        this.isAvailable(other) &&
        (isModifierBinding(definition) || isModifierBinding(other)
          ? definition.kind === other.kind
          : true) &&
        !(
          definition.kind === ShortcutBindingKind.Tool && other.kind === ShortcutBindingKind.Tool
        ) &&
        overlaps(other.context, definition.context) &&
        this.bindings(other, draft).some((binding) => {
          return this.sameBinding(definition, binding, shortcut);
        }),
    );
  }
  assign(
    draft: ShortcutOverrides,
    definition: ShortcutDefinition,
    shortcut: string,
    replacing?: string,
  ): ShortcutOverrides {
    let next = draft;
    for (const conflict of this.conflicts(definition, shortcut, draft))
      next = this.update(
        next,
        conflict.key,
        this.bindings(conflict, next).filter(
          (binding) => !this.sameBinding(definition, binding, shortcut),
        ),
      );
    const bindings = this.bindings(definition, next).filter((binding) => binding !== replacing);
    return this.update(next, definition.key, [...bindings, shortcut]);
  }
  private isHeldShortcutInput(input: ShortcutInput): boolean {
    return SHORTCUT_DEFINITIONS.some(
      (definition) =>
        (definition.kind === ShortcutBindingKind.QuickTool ||
          definition.kind === ShortcutBindingKind.Drag) &&
        this.bindings(definition).some((binding) => {
          const key = shortcutToInput(binding, true).key;
          return (
            !!key &&
            key.toLowerCase() === input.key.toLowerCase() &&
            this.heldBindingPressed(binding, input)
          );
        }),
    );
  }
  private isActionInput(input: ShortcutInput, actionContexts: readonly string[]): boolean {
    return SHORTCUT_DEFINITIONS.some(
      (definition) =>
        definition.kind === ShortcutBindingKind.Action &&
        actionContexts.some((context) => activeContext(definition, context)) &&
        this.bindings(definition).some((binding) => {
          const key = shortcutToInput(binding, true).key;
          return (
            !!key &&
            key.toLowerCase() === input.key.toLowerCase() &&
            shortcutMatches(binding, input, true, true)
          );
        }),
    );
  }
  resolve(
    input: ShortcutInput,
    fallback: EditorCommand | null,
    context = "Normal",
    actionContexts: readonly string[] = [],
  ): EditorCommand | null {
    if (
      input.editingText ||
      this.isActionInput(input, actionContexts) ||
      this.isHeldShortcutInput(input)
    )
      return null;
    const candidates = SHORTCUT_DEFINITIONS.filter(
      (definition) =>
        hasCommand(definition) &&
        activeContext(definition, context) &&
        this.bindings(definition).some((binding) => shortcutMatches(binding, input)),
    );
    candidates.sort((a, b) => Number(a.context === "Any") - Number(b.context === "Any"));
    const first = candidates[0];
    if (first?.command?.type === "tool") {
      const tools = candidates
        .filter((entry) => entry.command?.type === "tool")
        .map((entry) => (entry.command as Extract<EditorCommand, { type: "tool" }>).tool);
      return { type: "tool", tool: tools[0], ...(tools.length > 1 ? { tools } : {}) };
    }
    if (first?.command) return first.command;
    if (
      SHORTCUT_DEFINITIONS.some(
        (definition) =>
          hasCommand(definition) &&
          activeContext(definition, context) &&
          [...definition.defaults, ...this.bindings(definition, {})].some((binding) =>
            shortcutMatches(binding, input),
          ),
      )
    )
      return null;
    // The core fallback has no platform or custom-binding policy. Once an
    // action is catalogued, only the bindings above may activate it.
    if (
      fallback &&
      SHORTCUT_DEFINITIONS.some(
        (definition) =>
          hasCommand(definition) &&
          activeContext(definition, context) &&
          Object.entries(definition.command!).every(
            ([key, value]) =>
              key === "tools" || (fallback as unknown as Record<string, unknown>)[key] === value,
          ),
      )
    )
      return null;
    return fallback;
  }
  setPressedKey(key: string, pressed: boolean, editingText = false) {
    if (pressed && editingText && !MODIFIER_KEYS.has(key.toLowerCase())) return;
    if (pressed) this.pressedKeys.add(key.toLowerCase());
    else this.pressedKeys.delete(key.toLowerCase());
  }
  clearPressedKeys() {
    this.pressedKeys.clear();
  }
  isControlPressed() {
    return this.pressedKeys.has(ModifierKey.Control);
  }
  resolveAction(actionId: string, input: ShortcutInput, context?: string): boolean {
    const definition = SHORTCUT_DEFINITIONS.find(
      (entry) =>
        entry.kind === ShortcutBindingKind.Action &&
        entry.id === actionId &&
        (!context || activeContext(entry, context)),
    );
    if (!definition) return false;
    return this.bindings(definition).some((binding) => {
      const key = shortcutToInput(binding, true).key.toLowerCase();
      return (
        (!key || this.pressedKeys.has(key) || input.key.toLowerCase() === key) &&
        shortcutMatches(binding, input, true, true)
      );
    });
  }
  private heldBindingPressed(binding: string, input: ShortcutInput): boolean {
    const expected = shortcutToInput(binding, true);
    const key = expected.key.toLowerCase();
    return (
      (!key || this.pressedKeys.has(key) || input.key.toLowerCase() === key) &&
      shortcutMatches(binding, input, true)
    );
  }
  resolveQuickTool(input: ShortcutInput): EditorTool | null {
    if (input.editingText) return null;
    const definition = SHORTCUT_DEFINITIONS.find(
      (entry) =>
        entry.kind === ShortcutBindingKind.QuickTool &&
        this.bindings(entry).some((binding) => this.heldBindingPressed(binding, input)),
    );
    return definition?.command?.type === "tool" ? definition.command.tool : null;
  }
  dragVector(
    definition: ShortcutDefinition,
    draft: ShortcutOverrides = this.overrides,
  ): ShortcutDragVector {
    const vector = draft[dragVectorIdentity(definition)];
    return isVector(vector) ? vector : (definition.vector ?? { x: 4, y: 0 });
  }
  updateDragVector(
    draft: ShortcutOverrides,
    definition: ShortcutDefinition,
    vector: ShortcutDragVector,
  ): ShortcutOverrides {
    if (definition.kind !== ShortcutBindingKind.Drag || !isVector(vector))
      throw new Error("Invalid drag shortcut vector.");
    const next = { ...draft };
    const key = dragVectorIdentity(definition);
    if (vector.x === definition.vector?.x && vector.y === definition.vector?.y) delete next[key];
    else next[key] = { x: vector.x, y: vector.y };
    return next;
  }
  resolveDragActions(input: ShortcutInput): readonly ResolvedShortcutDragAction[] {
    if (input.editingText) return [];
    return SHORTCUT_DEFINITIONS.flatMap((definition) => {
      if (definition.kind !== ShortcutBindingKind.Drag) return [];
      const binding = this.bindings(definition).find((entry) =>
        this.heldBindingPressed(entry, input),
      );
      return binding
        ? [
            {
              id: definition.id as ShortcutDragAction,
              definitionKey: definition.key,
              binding,
              vector: this.dragVector(definition),
            },
          ]
        : [];
    });
  }
  isDragActionPressed(action: ResolvedShortcutDragAction, input: ShortcutInput): boolean {
    return !input.editingText && this.heldBindingPressed(action.binding, input);
  }
  resolveWheel(
    input: EditorWheelPolicyInput,
    fallback: EditorWheelAction,
  ): EditorWheelAction | null {
    if (input.kind === EditorWheelInputKind.Magnify) return fallback;
    const definitions = SHORTCUT_DEFINITIONS.filter(
      (entry) => entry.kind === ShortcutBindingKind.Wheel,
    );
    if (
      !definitions.some((entry) => Object.prototype.hasOwnProperty.call(this.overrides, entry.key))
    )
      return fallback;
    const keyboard = {
      key: "",
      ctrl: input.ctrl,
      meta: input.meta,
      space: this.pressedKeys.has(" "),
      shift: input.shift,
      alt: input.alt,
    };
    const ordered = [...definitions].sort(
      (a, b) =>
        Number(Object.prototype.hasOwnProperty.call(this.overrides, b.key)) -
        Number(Object.prototype.hasOwnProperty.call(this.overrides, a.key)),
    );
    const matched = ordered.find((entry) =>
      this.bindings(entry).some((binding) => shortcutMatches(binding, keyboard, true)),
    );
    if (matched)
      return Object.prototype.hasOwnProperty.call(this.overrides, matched.key)
        ? (WHEEL_ACTIONS[matched.id] ?? fallback)
        : fallback;
    if (
      definitions.some(
        (entry) =>
          Object.prototype.hasOwnProperty.call(this.overrides, entry.key) &&
          WHEEL_ACTIONS[entry.id] === fallback &&
          entry.defaults.some((binding) => shortcutMatches(binding, keyboard, true)),
      )
    )
      return null;
    return fallback;
  }
  formatToolShortcut(tool: string, fallback = ""): string {
    const definition = SHORTCUT_DEFINITIONS.find(
      (entry) => entry.command?.type === "tool" && entry.command.tool === tool,
    );
    return definition ? this.bindings(definition).join(", ") : fallback;
  }
  formatShortcut(commandId: string, params?: Record<string, string>, fallback = ""): string {
    const definition = SHORTCUT_DEFINITIONS.find(
      (entry) =>
        entry.kind === ShortcutBindingKind.Command &&
        entry.id === commandId &&
        shortcutIdentity(entry.kind, entry.id, entry.context, entry.params) ===
          shortcutIdentity(entry.kind, entry.id, entry.context, params),
    );
    return definition ? this.bindings(definition).join(", ") : fallback;
  }
  async importDraft(draft: ShortcutOverrides): Promise<ShortcutOverrides | null> {
    if (!this.files) return null;
    const entries = await this.files.read();
    if (!entries) return null;
    let next = draft;
    for (const entry of entries) {
      const key = shortcutIdentity(entry.kind, entry.id, entry.context, entry.params);
      const actionDefinitions =
        entry.kind === ShortcutBindingKind.Action
          ? SHORTCUT_DEFINITIONS.filter(
              (candidate) => candidate.kind === entry.kind && candidate.id === entry.id,
            )
          : [];
      // Native files can split one action into translation/scaling contexts;
      // the product exposes the shared binding once for that supported action.
      const definition =
        SHORTCUT_DEFINITIONS.find((candidate) => candidate.key === key) ??
        (actionDefinitions.length === 1 ? actionDefinitions[0] : undefined);
      if (!definition) continue;
      const shortcut = this.normalizeBinding(definition, entry.shortcut);
      if (shortcut === null) throw new Error("Invalid keyboard shortcut in imported file.");
      if (entry.vector && definition.kind === ShortcutBindingKind.Drag)
        next = this.updateDragVector(next, definition, entry.vector);
      if (entry.removed)
        next = this.update(
          next,
          definition.key,
          this.bindings(definition, next).filter((binding) => binding !== shortcut),
        );
      else next = this.assign(next, definition, shortcut);
    }
    return next;
  }
  async exportDraft(draft: ShortcutOverrides): Promise<void> {
    if (!this.files) return;
    const entries: ShortcutFileEntry[] = [];
    for (const definition of SHORTCUT_DEFINITIONS) {
      const hasBindings = Object.prototype.hasOwnProperty.call(draft, definition.key);
      const hasVector = Object.prototype.hasOwnProperty.call(draft, dragVectorIdentity(definition));
      if (!hasBindings && !hasVector) continue;
      const bindings = this.bindings(definition, draft);
      const defaults = this.bindings(definition, {});
      const additions = bindings.filter((shortcut) => !defaults.includes(shortcut));
      if (hasVector && !additions.length && bindings.length) additions.push(bindings[0]);
      for (const [shortcuts, removed] of [
        [defaults.filter((shortcut) => !bindings.includes(shortcut)), true],
        [additions, false],
      ] as const)
        for (const shortcut of shortcuts)
          entries.push({
            kind: definition.kind,
            id: definition.id,
            context:
              definition.kind === ShortcutBindingKind.Action
                ? "Any"
                : definition.context.replace(/\s+/g, ""),
            params: definition.params,
            shortcut,
            removed,
            vector:
              definition.kind === ShortcutBindingKind.Drag
                ? this.dragVector(definition, draft)
                : undefined,
          });
    }
    await this.files.write(entries);
  }
}
