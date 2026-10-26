import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  chooseUiPortalContainer,
  findUiPortalRoot,
  resolveUiPortalContainer,
} from "$/components/theme/portal";

type MockNode = {
  nodeType: number;
  ownerDocument: MockDocument | null;
  parentElement: MockNode | null;
  contains(other: object): boolean;
  querySelector(selector: string): MockNode | null;
};

type MockDocument = {
  fullscreenElement: MockNode | null;
  webkitFullscreenElement?: MockNode | null;
  body: MockNode;
  documentElement?: MockNode;
};

function element(owner: MockDocument | null, children: MockNode[] = []): MockNode {
  const node: MockNode = {
    nodeType: 1,
    ownerDocument: owner,
    parentElement: null,
    contains(other) {
      return other === node || children.some((child) => child === other || child.contains(other));
    },
    querySelector(selector) {
      if (selector !== "[data-ui-portal-root]") return null;
      return (
        children.find(
          (child) =>
            (child as MockNode & { dataset?: { uiPortalRoot?: string } }).dataset?.uiPortalRoot ===
            "",
        ) ?? null
      );
    },
  };
  for (const child of children) child.parentElement = node;
  return node;
}

function portalRoot(owner: MockDocument | null): MockNode {
  const node = element(owner);
  (node as MockNode & { dataset: { uiPortalRoot: string } }).dataset = { uiPortalRoot: "" };
  return node;
}

describe("chooseUiPortalContainer", () => {
  it("falls back to body when nothing is fullscreen", () => {
    const root = {} as MockDocument;
    const body = element(root);
    root.fullscreenElement = null;
    root.body = body;
    assert.equal(chooseUiPortalContainer(undefined, root as unknown as Document), body);
    assert.equal(chooseUiPortalContainer(body, root as unknown as Document), body);
  });

  it("keeps a preferred scene that already lives under the fullscreen element", () => {
    const root = {} as MockDocument;
    const body = element(root);
    const scene = element(root);
    const fullscreen = element(root, [scene]);
    root.fullscreenElement = fullscreen;
    root.body = body;
    assert.equal(chooseUiPortalContainer(scene, root as unknown as Document), scene);
  });

  it("does not keep body or the fullscreen element itself as the preferred mount", () => {
    const root = {} as MockDocument;
    const body = element(root);
    const fullscreen = element(root, [body]);
    root.fullscreenElement = fullscreen;
    root.body = body;
    assert.equal(chooseUiPortalContainer(body, root as unknown as Document), fullscreen);
    assert.equal(chooseUiPortalContainer(fullscreen, root as unknown as Document), fullscreen);
    assert.equal(chooseUiPortalContainer(undefined, root as unknown as Document), fullscreen);
  });

  it("keeps a preferred node that belongs to another document", () => {
    const iframe = {} as MockDocument;
    const iframeBody = element(iframe);
    iframe.fullscreenElement = null;
    iframe.body = iframeBody;
    const root = {} as MockDocument;
    const body = element(root);
    const fullscreen = element(root);
    root.fullscreenElement = fullscreen;
    root.body = body;
    assert.equal(chooseUiPortalContainer(iframeBody, root as unknown as Document), iframeBody);
  });

  it("reads webkitFullscreenElement when the unprefixed getter is empty", () => {
    const root = {} as MockDocument;
    const body = element(root);
    const fullscreen = element(root);
    root.fullscreenElement = null;
    root.webkitFullscreenElement = fullscreen;
    root.body = body;
    assert.equal(chooseUiPortalContainer(body, root as unknown as Document), fullscreen);
  });
});

describe("findUiPortalRoot / resolveUiPortalContainer", () => {
  it("prefers a React-owned [data-ui-portal-root] over appending to the fullscreen node", () => {
    const root = {} as MockDocument;
    const body = element(root);
    const host = portalRoot(root);
    const fullscreen = element(root, [host]);
    root.fullscreenElement = fullscreen;
    root.body = body;
    assert.equal(findUiPortalRoot(fullscreen as unknown as Element), host);
    assert.equal(resolveUiPortalContainer(body, root as unknown as Document), host);
    assert.equal(resolveUiPortalContainer(undefined, root as unknown as Document), host);
  });

  it("still keeps a preferred scene that already lives under the fullscreen element", () => {
    const root = {} as MockDocument;
    const body = element(root);
    const scene = element(root);
    const host = portalRoot(root);
    const fullscreen = element(root, [scene, host]);
    root.fullscreenElement = fullscreen;
    root.body = body;
    assert.equal(resolveUiPortalContainer(scene, root as unknown as Document), scene);
  });
});
