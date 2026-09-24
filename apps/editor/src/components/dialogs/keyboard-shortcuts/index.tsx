import { useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import {
  type KeyboardShortcutItem,
  type KeyboardShortcutSection,
  KeyboardShortcutsDialog,
} from "$/components/dialogs/keyboard-shortcuts/KeyboardShortcutsDialog";
import { ShortcutCaptureDialog } from "$/components/dialogs/keyboard-shortcuts/ShortcutCaptureDialog";
import { ShortcutDragOptions } from "$/components/dialogs/keyboard-shortcuts/ShortcutDragOptions";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  SHORTCUT_DEFINITIONS,
  SHORTCUT_MENU_ITEMS,
  ShortcutBindingKind,
  ShortcutSectionId,
  type ShortcutDefinition,
} from "$/managers/shortcuts/shortcut-manager";
import { useShortcutEditor } from "$/managers/shortcuts/use-shortcut-editor";
import { formatShortcutForPlatform } from "@xprite/ui/utils";

interface BindingEdit {
  definition: ShortcutDefinition;
  replacing?: string;
  shortcut: string;
}

/** Browses the product catalog and edits a transactional workspace shortcut draft. */
export function EditorKeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  useUiLanguage();
  const editor = useShortcutEditor(open);
  const [edit, setEdit] = useState<BindingEdit | null>(null);
  const sceneBounds = useSceneBounds();
  const row = (definition: ShortcutDefinition): KeyboardShortcutItem => {
    const bindings = editor.manager.bindings(definition, editor.draft);
    const format = (binding: string) =>
      binding ? formatShortcutForPlatform(binding) : tUiSource("Default");
    return {
      definitionKey: definition.key,
      label:
        definition.kind === ShortcutBindingKind.QuickTool
          ? tUi("ui.shortcuts.quick.tool", { value1: tUiSource(definition.label) })
          : definition.label,
      shortcut: bindings.map(format).join(", "),
      context: definition.context === "Any" ? "" : definition.context,
      bindings: bindings.map((binding) => ({ value: binding, label: format(binding) })),
      queryText: `${definition.id} ${JSON.stringify(definition.params ?? {})}`,
    };
  };
  const sections: KeyboardShortcutSection[] = [
    {
      id: ShortcutSectionId.Menus,
      label: "Menus",
      items: SHORTCUT_MENU_ITEMS.flatMap((item) => {
        const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.key === item.definitionKey);
        return definition && editor.manager.isAvailable(definition)
          ? [{ ...row(definition), label: item.label, path: item.path, depth: item.depth }]
          : [];
      }),
    },
    {
      id: ShortcutSectionId.Commands,
      label: "Commands",
      items: SHORTCUT_DEFINITIONS.filter(
        (entry) => entry.kind === ShortcutBindingKind.Command && editor.manager.isAvailable(entry),
      ).map(row),
    },
    {
      id: ShortcutSectionId.Tools,
      label: "Tools",
      items: SHORTCUT_DEFINITIONS.filter(
        (entry) => entry.kind === ShortcutBindingKind.Tool,
      ).flatMap((definition) => {
        const quick = SHORTCUT_DEFINITIONS.find(
          (entry) => entry.kind === ShortcutBindingKind.QuickTool && entry.id === definition.id,
        );
        return [row(definition), ...(quick ? [row(quick)] : [])];
      }),
    },
    {
      id: ShortcutSectionId.Actions,
      label: "Action Modifiers",
      items: SHORTCUT_DEFINITIONS.filter((entry) => entry.kind === ShortcutBindingKind.Action).map(
        row,
      ),
    },
    {
      id: ShortcutSectionId.Wheel,
      label: "Mouse Wheel",
      items: SHORTCUT_DEFINITIONS.filter((entry) => entry.kind === ShortcutBindingKind.Wheel).map(
        row,
      ),
    },
    {
      id: ShortcutSectionId.Drag,
      label: "Drag Value",
      items: SHORTCUT_DEFINITIONS.filter((entry) => entry.kind === ShortcutBindingKind.Drag).map(
        row,
      ),
    },
  ];
  const definitionFor = (item: KeyboardShortcutItem) =>
    SHORTCUT_DEFINITIONS.find((entry) => entry.key === item.definitionKey);
  const close = (next: boolean) => {
    if (!next) setEdit(null);
    onOpenChange(next);
  };
  return (
    <>
      <KeyboardShortcutsDialog
        open={open}
        onOpenChange={close}
        sections={sections}
        sceneBounds={sceneBounds}
        suspendFocus={!!edit}
        message={editor.error}
        busy={editor.busy}
        onApply={editor.apply}
        onConfirm={editor.apply}
        onEditBinding={(item, replacing) => {
          const definition = definitionFor(item);
          if (definition) setEdit({ definition, replacing, shortcut: replacing ?? "" });
        }}
        onDeleteBinding={(item, binding) => {
          const definition = definitionFor(item);
          if (definition) editor.remove(definition, binding);
        }}
        onResetItem={(item) => editor.reset(item.definitionKey)}
        renderItemOptions={(item) => {
          const definition = definitionFor(item);
          return definition?.kind === ShortcutBindingKind.Drag ? (
            <ShortcutDragOptions
              vector={editor.manager.dragVector(definition, editor.draft)}
              onChange={(vector) => editor.updateDragVector(definition, vector)}
            />
          ) : null;
        }}
        actions={[
          {
            id: "import",
            label: "Import...",
            disabled: editor.busy || !editor.manager.fileActionsAvailable,
            onSelect: editor.importFile,
          },
          {
            id: "export",
            label: "Export...",
            disabled: editor.busy || !editor.manager.fileActionsAvailable,
            onSelect: editor.exportFile,
          },
          { id: "reset", label: "Reset", disabled: editor.busy, onSelect: () => editor.reset() },
        ]}
        labels={{
          title: tUi("ui.keyboard.shortcuts.ba51bd57"),
          search: tUi("ui.search.keyboard.shortcuts"),
          action: tUi("ui.action"),
          key: tUi("ui.key"),
          context: tUi("ui.context"),
          confirm: tUiSource("OK"),
          cancel: tUiSource("Cancel"),
          fileActions: tUiSource("Shortcut file actions"),
          list: tUi("ui.shortcuts"),
          describeResults: (count, query, section) =>
            query
              ? tUi("ui.matching.shortcuts", { value1: count })
              : tUi("ui.shortcuts.in", { value1: count, value2: tUiSource(section) }),
        }}
      />
      {open && edit && (
        <ShortcutCaptureDialog
          key={`${edit.definition.key}:${edit.replacing ?? "new"}`}
          definition={edit.definition}
          initialShortcut={edit.replacing}
          conflicts={editor.manager.conflicts(edit.definition, edit.shortcut, editor.draft)}
          onChange={(shortcut) => setEdit({ ...edit, shortcut })}
          onAccept={(shortcut) => {
            editor.assign(edit.definition, shortcut, edit.replacing);
            setEdit(null);
          }}
          onCancel={() => setEdit(null)}
        />
      )}
    </>
  );
}
