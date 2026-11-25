import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { describe, it } from "vitest";

interface VNode {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
  key?: unknown;
}

function resolveTree(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(resolveTree);
  if (!node || typeof node !== "object") return node;
  const vnode = node as VNode;
  if (typeof vnode.type === "function")
    return resolveTree(
      (vnode.type as (props: Record<string, unknown>) => unknown)(vnode.props ?? {}),
    );
  if (vnode.props && "children" in vnode.props)
    return { ...vnode, props: { ...vnode.props, children: resolveTree(vnode.props.children) } };
  return vnode;
}

function collectNodes(
  node: unknown,
  predicate: (node: VNode) => boolean,
  out: VNode[] = [],
): VNode[] {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const vnode = node as VNode;
  if (predicate(vnode)) out.push(vnode);
  if (vnode.props && "children" in vnode.props) collectNodes(vnode.props.children, predicate, out);
  return out;
}

describe("ExportDialog active panel mounting", () => {
  it("unmounts inactive exporter panel DOM when switching destinations and preserves drafts", async () => {
    const hookSource = `
      export const Suspense = ({ children }) => children;
      export const createElement = (type, props, ...children) => ({
        type,
        key: props?.key,
        props: { ...(props ?? {}), ...(children.length === 1 ? { children: children[0] } : children.length > 1 ? { children } : {}) },
      });
      export const useState = (initial) => globalThis.__unifiedExportHooks.state(initial);
      export const useRef = (initial) => globalThis.__unifiedExportHooks.ref(initial);
      export const useMemo = (factory) => factory();
      export const useEffect = (fn, deps) => globalThis.__unifiedExportHooks.effect(fn, deps);
    `;
    const result = await build({
      entryPoints: ["apps/editor/src/components/dialogs/export-dialog/index.tsx"],
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      write: false,
      plugins: [
        {
          name: "export-dialog-harness",
          setup(pluginBuild) {
            pluginBuild.onResolve({ filter: /^react$/ }, () => ({
              path: "react",
              namespace: "harness",
            }));
            pluginBuild.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
              path: "jsx",
              namespace: "harness",
            }));
            pluginBuild.onResolve({ filter: /^\$\/components\/canvas\/scene-bounds$/ }, () => ({
              path: "scene-bounds",
              namespace: "harness",
            }));
            pluginBuild.onResolve({ filter: /^\$\/components\/dialogs\/overlay$/ }, () => ({
              path: "overlay",
              namespace: "harness",
            }));
            pluginBuild.onResolve({ filter: /^\$\/i18n$/ }, () => ({
              path: "i18n",
              namespace: "harness",
            }));
            pluginBuild.onResolve({ filter: /^@xprite\/ui(\/.*)?$/ }, (args) => ({
              path: args.path,
              namespace: "harness",
            }));
            pluginBuild.onResolve({ filter: /\.css$/ }, (args) => ({
              path: args.path,
              namespace: "styles",
            }));
            pluginBuild.onLoad({ filter: /.*/, namespace: "harness" }, (args) => {
              if (args.path === "react") return { contents: hookSource, loader: "js" };
              if (args.path === "jsx")
                return {
                  contents: `export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment=({children})=>children;`,
                  loader: "js",
                };
              if (args.path === "scene-bounds")
                return {
                  contents: `export const useSceneBounds=()=>({x:0,y:0,width:1280,height:800});`,
                  loader: "js",
                };
              if (args.path === "overlay")
                return {
                  contents: `export const EditorDialog=({children})=>({type:"dialog",props:{children}});`,
                  loader: "js",
                };
              if (args.path === "i18n")
                return {
                  contents: `export const useUiLanguage=()=>"en";export const tUi=(key)=>key;`,
                  loader: "js",
                };
              if (args.path === "@xprite/ui/assets")
                return {
                  contents: `export const centerUiPixel=(origin,outer,inner)=>origin+Math.round((outer-inner)/2);export const measureUiText=(text)=>text.length*8;export const useUiAssets=()=>null;`,
                  loader: "js",
                };
              if (args.path === "@xprite/ui/canvas")
                return { contents: `export const RASTER_SCALE=2;`, loader: "js" };
              if (args.path === "@xprite/ui/utils")
                return {
                  contents: `export const clientRect=()=>({width:10,height:10});export const dropdownArrowOffsetY=()=>0;export const isImeKeyboardEvent=()=>false;`,
                  loader: "js",
                };
              return {
                contents: `
                  export const Button = (props) => ({ type: "button", props });
                  export const FontRole = { Primary: "primary" };
                  export const Menu = ({ items, renderTrigger }) => ({ type: "menu", props: { items, children: renderTrigger({}) } });
                  export const MenuCheckType = { Radio: "radio" };
                  export const OverlayContentLayout = { Flow: "flow" };
                  export const Text = (props) => ({ type: "text", props });
                  export const TextVariant = { Control: "control" };
                  export const Icon = (props) => ({ type: "icon", props });
                  export const createModalFocusScope = () => ({ isActive: () => false, dispose: () => false });
                  export const focusDialogContainer = () => {};
                  export const isDialogPopupTarget = () => false;
                `,
                loader: "js",
              };
            });
            pluginBuild.onLoad({ filter: /.*/, namespace: "styles" }, () => ({
              contents: `export default { body: "body", selector: "selector", panel: "panel", menuArrow: "menuArrow" };`,
              loader: "js",
            }));
          },
        },
      ],
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "export-dialog-dom-"));
    const bundle = path.join(directory, "export-dialog.mjs");
    fs.writeFileSync(bundle, result.outputFiles[0].contents);
    const { ExportDialog } = await import(pathToFileURL(bundle).href);
    fs.rmSync(directory, { recursive: true, force: true });

    // Stateful hook store keyed by render order; ExportDialog stays mounted while panels switch.
    const state: unknown[] = [];
    const refs: { current: unknown }[] = [];
    let stateCursor = 0;
    let refCursor = 0;
    const hooksGlobal = globalThis as typeof globalThis & {
      __unifiedExportHooks?: {
        state(initial: unknown): [unknown, (next: unknown) => void];
        ref(initial: unknown): { current: unknown };
        effect(): void;
      };
    };
    hooksGlobal.__unifiedExportHooks = {
      state(initial: unknown) {
        const i = stateCursor++;
        if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
        return [
          state[i],
          (value: unknown) => {
            state[i] = typeof value === "function" ? value(state[i]) : value;
          },
        ];
      },
      ref(initial: unknown) {
        const i = refCursor++;
        if (!(i in refs)) refs[i] = { current: initial };
        return refs[i];
      },
      effect() {},
    };

    const panelRenders: string[] = [];
    const seenImageProps: { draft?: unknown; choiceRequest?: { id: string } }[] = [];
    const imagePanel = (props: {
      draft?: unknown;
      choiceRequest?: { id: string };
      onDraftChange?: (draft: unknown) => void;
    }) => {
      panelRenders.push("image");
      seenImageProps.push({ draft: props.draft, choiceRequest: props.choiceRequest });
      if (!props.draft) props.onDraftChange?.({ frames: "selected", resize: "200.00" });
      return {
        type: "div",
        props: {
          "data-exporter": "image",
          children: [
            { type: "input", props: { type: "checkbox", "aria-label": "Export for Twitter" } },
            { type: "input", props: { type: "checkbox", "aria-label": "Ignore empty frames" } },
            { type: "button", props: { "aria-label": "Export", "data-panel": "image" } },
          ],
        },
      };
    };
    const sheetPanel = () => {
      panelRenders.push("sprite-sheet");
      return {
        type: "div",
        props: {
          "data-exporter": "sprite-sheet",
          children: [
            { type: "button", props: { "aria-label": "Export", "data-panel": "sprite-sheet" } },
          ],
        },
      };
    };
    const beadsPanel = () => {
      panelRenders.push("beads");
      return {
        type: "div",
        props: {
          "data-exporter": "beads",
          children: [{ type: "button", props: { "aria-label": "Export", "data-panel": "beads" } }],
        },
      };
    };

    const entries = [
      {
        id: "image",
        label: () => "PNG image (.png)",
        initialSize: { width: 456, height: 336 },
        initialChoices: [
          { id: "gif", label: "ui.export.format.gif" },
          { id: "apng", label: "ui.export.format.apng" },
        ],
        available: () => true,
      },
      {
        id: "sprite-sheet",
        label: () => "Sprite Sheet",
        group: "sheets",
        initialSize: { width: 562, height: 282 },
        available: () => true,
      },
      {
        id: "beads",
        label: () => "Fuse Beads",
        group: "crafts",
        initialSize: { width: 960, height: 640 },
        available: () => true,
      },
    ];
    const registry = {
      entries,
      get: (id: string) => entries.find((entry) => entry.id === id),
    };
    // All three panels exist in props.panels (as happens after visiting destinations in one dialog session).
    const panels = new Map<string, typeof imagePanel>([
      ["image", imagePanel],
      ["sprite-sheet", sheetPanel],
      ["beads", beadsPanel],
    ]);

    let destination = "image";
    const render = () => {
      stateCursor = 0;
      refCursor = 0;
      panelRenders.length = 0;
      return resolveTree(
        ExportDialog({
          registry,
          context: {},
          panels,
          destination,
          onDestinationChange: (next: string) => {
            destination = next;
          },
          onModuleBusyChange: () => {},
          onExported: () => {},
          execute: () => {},
          filePreferences: {},
          busy: false,
          onClose: () => {},
        }),
      );
    };

    // 1. Initial render on "image": only image panel is mounted.
    const imageTree = render();
    assert.deepEqual(panelRenders, ["image"]);
    const imageSections = collectNodes(imageTree, (node) => node.type === "section");
    assert.equal(imageSections.length, 1);
    assert.equal(imageSections[0].key, "image");
    assert.equal(imageSections[0].props.hidden, undefined);
    const imageExportButtons = collectNodes(
      imageTree,
      (node) => node.type === "button" && node.props["aria-label"] === "Export",
    );
    assert.equal(imageExportButtons.length, 1);
    assert.equal(imageExportButtons[0].props["data-panel"], "image");

    // 2. Switch to "sprite-sheet": image panel must unmount completely (no hidden DOM or duplicate Export button).
    destination = "sprite-sheet";
    const sheetTree = render();
    assert.deepEqual(panelRenders, ["sprite-sheet"]);
    const sheetSections = collectNodes(sheetTree, (node) => node.type === "section");
    assert.equal(sheetSections.length, 1);
    assert.equal(sheetSections[0].key, "sprite-sheet");
    assert.equal(sheetSections[0].props.hidden, undefined);
    const sheetExportButtons = collectNodes(
      sheetTree,
      (node) => node.type === "button" && node.props["aria-label"] === "Export",
    );
    assert.equal(sheetExportButtons.length, 1);
    assert.equal(sheetExportButtons[0].props["data-panel"], "sprite-sheet");
    const leakedCheckboxes = collectNodes(
      sheetTree,
      (node) =>
        node.type === "input" &&
        (node.props["aria-label"] === "Export for Twitter" ||
          node.props["aria-label"] === "Ignore empty frames"),
    );
    assert.equal(leakedCheckboxes.length, 0);

    // 3. Switch to "beads": strictly one mounted panel and one Export button.
    destination = "beads";
    const beadsTree = render();
    assert.deepEqual(panelRenders, ["beads"]);
    assert.equal(collectNodes(beadsTree, (node) => node.type === "section").length, 1);
    const beadsExportButtons = collectNodes(
      beadsTree,
      (node) => node.type === "button" && node.props["aria-label"] === "Export",
    );
    assert.equal(beadsExportButtons.length, 1);
    assert.equal(beadsExportButtons[0].props["data-panel"], "beads");

    // 4. Select APNG from the Format menu to return to "image": draft state is restored and request is forwarded.
    const menuNode = collectNodes(beadsTree, (node) => node.type === "menu")[0];
    const items = menuNode.props.items as { label: string; onSelect?: () => void }[];
    const apngItem = items.find((item) => item.label === "ui.export.format.apng");
    assert.ok(apngItem?.onSelect);
    apngItem.onSelect();
    assert.equal(destination, "image");
    const returnedTree = render();
    assert.deepEqual(panelRenders, ["image"]);
    assert.equal(collectNodes(returnedTree, (node) => node.type === "section").length, 1);
    const latestImageProps = seenImageProps[seenImageProps.length - 1];
    assert.deepEqual(latestImageProps.draft, { frames: "selected", resize: "200.00" });
    assert.deepEqual(latestImageProps.choiceRequest, { id: "apng" });

    delete hooksGlobal.__unifiedExportHooks;
  }, 60_000);
});
