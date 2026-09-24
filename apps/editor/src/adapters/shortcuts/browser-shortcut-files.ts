import { EditorPrimaryModifier } from "$/managers/ports/platform";
import {
  ShortcutBindingKind,
  type ShortcutFileEntry,
  type ShortcutFilePort,
} from "$/managers/ports/shortcut-files";

const FILE_EXTENSION = ".aseprite-keys";
const MAX_FILE_SIZE = 1024 * 1024;
const GROUPS = {
  commands: ShortcutBindingKind.Command,
  tools: ShortcutBindingKind.Tool,
  quicktools: ShortcutBindingKind.QuickTool,
  actions: ShortcutBindingKind.Action,
  wheel: ShortcutBindingKind.Wheel,
  drag: ShortcutBindingKind.Drag,
} as const;

function parseShortcutFile(
  source: string,
  primaryModifier: EditorPrimaryModifier,
): ShortcutFileEntry[] {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror") || document.documentElement.tagName !== "keyboard")
    throw new Error("Invalid keyboard shortcuts file.");
  const entries: ShortcutFileEntry[] = [];
  for (const [group, kind] of Object.entries(GROUPS)) {
    for (const element of document.querySelectorAll(`keyboard > ${group} > key`)) {
      const id = element.getAttribute(
        kind === ShortcutBindingKind.Command
          ? "command"
          : kind === ShortcutBindingKind.Tool || kind === ShortcutBindingKind.QuickTool
            ? "tool"
            : "action",
      );
      const shortcut =
        (primaryModifier === EditorPrimaryModifier.Command ? element.getAttribute("mac") : null) ??
        element.getAttribute("shortcut");
      if (!id || shortcut === null) throw new Error("Invalid keyboard shortcut entry.");
      const params: Record<string, string> = {};
      for (const param of element.querySelectorAll(":scope > param")) {
        const name = param.getAttribute("name");
        const value = param.getAttribute("value");
        if (!name || value === null) throw new Error("Invalid keyboard shortcut parameters.");
        params[name] = value;
      }
      const vectorSource = element.getAttribute("vector");
      let vector;
      if (kind === ShortcutBindingKind.Drag && vectorSource !== null) {
        const parts = vectorSource.split(",");
        if (
          parts.length !== 2 ||
          parts.some((part) => !part.trim() || !Number.isFinite(Number(part)))
        )
          throw new Error("Invalid drag shortcut vector.");
        vector = { x: Number(parts[0]), y: Number(parts[1]) };
      }
      entries.push({
        kind,
        id,
        context: element.getAttribute("context") ?? "Any",
        params,
        shortcut,
        removed: element.getAttribute("removed") === "true",
        vector,
      });
    }
  }
  return entries;
}

function serializeShortcutFile(entries: readonly ShortcutFileEntry[]): string {
  const document = new DOMParser().parseFromString('<keyboard version="1"/>', "application/xml");
  for (const [name, kind] of Object.entries(GROUPS)) {
    const group = document.createElement(name);
    document.documentElement.append(group);
    for (const entry of entries.filter((candidate) => candidate.kind === kind)) {
      const key = document.createElement("key");
      key.setAttribute(
        kind === ShortcutBindingKind.Command
          ? "command"
          : kind === ShortcutBindingKind.Tool || kind === ShortcutBindingKind.QuickTool
            ? "tool"
            : "action",
        entry.id,
      );
      key.setAttribute("shortcut", entry.shortcut);
      if (entry.context !== "Any") key.setAttribute("context", entry.context);
      if (entry.removed) key.setAttribute("removed", "true");
      if (entry.vector) key.setAttribute("vector", `${entry.vector.x},${entry.vector.y}`);
      for (const [name, value] of Object.entries(entry.params ?? {})) {
        const param = document.createElement("param");
        param.setAttribute("name", name);
        param.setAttribute("value", value);
        key.append(param);
      }
      group.append(key);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(document)}\n`;
}

export function createBrowserShortcutFilePort(
  primaryModifier: EditorPrimaryModifier,
): ShortcutFilePort {
  return {
    read: () =>
      new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = FILE_EXTENSION;
        input.addEventListener("cancel", () => resolve(null), { once: true });
        input.addEventListener(
          "change",
          async () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            try {
              if (file.size > MAX_FILE_SIZE)
                throw new Error("Keyboard shortcuts file is too large.");
              resolve(parseShortcutFile(await file.text(), primaryModifier));
            } catch (error) {
              reject(error);
            }
          },
          { once: true },
        );
        input.click();
      }),
    write: async (entries) => {
      const blob = new Blob([serializeShortcutFile(entries)], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `keyboard-shortcuts${FILE_EXTENSION}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
}
