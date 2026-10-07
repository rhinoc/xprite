import { describe, expect, it } from "vitest";

import { EditorPresentationView } from "$/editor/presentation-view";
import { RasterEditor } from "$/editor/RasterEditor";

describe("detached editor presentation", () => {
  it("preserves control identities across raster samples and keeps view changes local", () => {
    const source = new RasterEditor({
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4),
    });
    const snapshot = source.getSnapshot();
    const pixels = structuredClone(source.canvas.previewComposite());
    const original = pixels.data.slice();
    const view = new EditorPresentationView();
    view.present(snapshot, pixels);
    const settings = view.getSnapshot().settings;
    pixels.data[0] = 255;
    view.present(snapshot, pixels);
    expect(view.getSnapshot().settings).toBe(settings);
    expect(view.canvas.previewComposite().data[0]).toBe(255);
    pixels.data[0] = 123;
    expect(view.canvas.previewComposite().data[0]).toBe(255);
    view.canvas.setView({ zoom: 4 });
    expect(snapshot.view.zoom).not.toBe(4);
    expect(source.getSnapshot()).toBe(snapshot);
    expect(source.getCommittedPersistenceSnapshot()?.document.layer.pixels.data).toEqual(original);
    expect(view.getCommittedPersistenceSnapshot()).toBeNull();
  });
});
