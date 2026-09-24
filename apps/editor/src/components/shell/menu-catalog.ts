import type { MenuItem } from "@xprite/ui";
import type { MenubarMenu } from "@xprite/ui";

export interface MenuCatalogNode {
  kind: string;
  label?: string;
  mnemonic?: string;
  mnemonicIndex?: number;
  shortcut?: string;
  command?: string;
  params?: Record<string, string | undefined>;
  marker?: string;
  children?: readonly MenuCatalogNode[];
}
export type MenuCommandCapability = Pick<
  MenuItem,
  "onSelect" | "disabled" | "checked" | "checkType"
>;
export interface MenuCatalogBindings {
  resolve: (node: MenuCatalogNode) => MenuCommandCapability | undefined;
  shortcut?: (node: MenuCatalogNode) => string | undefined;
  onResolved?: (node: MenuCatalogNode, capability: MenuCommandCapability) => void;
  recentFiles: readonly { id: string; name: string }[];
  openRecent: (id: string) => void;
}
/** Maps the product menu catalog to available editor actions. */
export function mapMenuCatalog(
  nodes: readonly MenuCatalogNode[],
  bindings: MenuCatalogBindings,
): MenubarMenu[] {
  function children(nodes: readonly MenuCatalogNode[]): MenuItem[] {
    const result: MenuItem[] = [];
    let separator = false;
    const add = (item: MenuItem) => {
      result.push({
        ...item,
        ...(separator && result.length ? { separator: true } : {}),
      });
      separator = false;
    };
    for (const node of nodes) {
      if (node.kind === "separator") {
        separator = true;
        continue;
      }
      if (node.kind === "placeholder") {
        if (node.marker === "recent-files") {
          separator = true;
          if (bindings.recentFiles.length) {
            for (const file of bindings.recentFiles)
              add({
                label: file.name,
                onSelect: () => bindings.openRecent(file.id),
              });
          } else add({ label: "No Recent File", disabled: true });
        }
        continue;
      }
      const item: MenuItem = {
        label: node.label ?? node.command ?? "",
        mnemonic: node.mnemonic,
        mnemonicIndex: node.mnemonicIndex,
        shortcut: bindings.shortcut ? bindings.shortcut(node) : node.shortcut,
      };
      if (node.kind === "menu") {
        item.children = children(node.children ?? []);
        // A submenu is usable navigation even if all of its commands are unavailable.
        item.disabled = item.children.length === 0;
      } else {
        const capability = bindings.resolve(node);
        if (capability?.onSelect) bindings.onResolved?.(node, capability);
        Object.assign(item, capability ?? { disabled: true });
      }
      add(item);
    }
    return result;
  }
  return nodes.map((node) => ({
    label: node.label ?? "",
    mnemonic: node.mnemonic,
    mnemonicIndex: node.mnemonicIndex,
    items: children(node.children ?? []),
  }));
}
