import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { EditorStateSource } from "$/managers/editor/editor-state-source";

describe("editor presentation source", () => {
  it("publishes only changed committed fields and preserves callback identity", () => {
    const setTool = () => {};
    const initial = { tool: "pencil", frame: 1, setTool };
    const source = new EditorStateSource(initial);
    let notifications = 0;
    const unsubscribe = source.subscribe(() => notifications++);
    source.setSnapshot({ ...initial });
    source.publish();
    assert.equal(notifications, 0);
    assert.equal(source.getSnapshot(), initial);
    source.setSnapshot({ ...initial, frame: 2 });
    assert.equal(notifications, 0);
    source.publish();
    source.publish();
    assert.equal(notifications, 1);
    assert.equal(source.getSnapshot().setTool, setTool);
    unsubscribe();
    source.setSnapshot({ ...initial, frame: 3 });
    source.publish();
    assert.equal(notifications, 1);
  });
});
