import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { chooseUiPortalContainer } from "$/components/theme/portal";

type MockNode = {
  nodeType: number;
  ownerDocument: MockDocument | null;
  contains(other: object): boolean;
};

type MockDocument = {
  fullscreenElement: MockNode | null;
  body: MockNode;
};

function element(owner: MockDocument | null, children: object[] = []): MockNode {
  const node: MockNode = {
    nodeType: 1,
    ownerDocument: owner,
    contains(other) {
      return other === node || children.includes(other);
    },
  };
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
});
