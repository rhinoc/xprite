import { IslandPreviewManager } from "$/managers/animal-crossing/ground/ground-manager";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import type { IslandPreviewPort } from "$/managers/ports/animal-crossing-ground";
import { ToolViewport } from "$/managers/preview/tool-viewport";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  ANIMAL_CROSSING_SIZE,
  animalCrossingGrid,
  AnimalCrossingConversion,
  type AnimalCrossingConversionSnapshot,
  defaultAnimalCrossingSettings,
  animalCrossingDocumentSource,
  type AnimalCrossingSettings,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

export type { AnimalCrossingSettings } from "@xprite/editor-core/import-export";
export enum AnimalCrossingLayout {
  Single = "single",
  Tiles = "tiles",
}

const EXAMPLE_TITLE = "Winding stone";
const EXAMPLE_CREATOR = "Amy";
const INITIAL_SIZE = { width: ANIMAL_CROSSING_SIZE, height: ANIMAL_CROSSING_SIZE };
export interface AnimalCrossingSnapshot extends AnimalCrossingConversionSnapshot {
  name: string;
  example: boolean;
  previewOpen: boolean;
  layout: AnimalCrossingLayout;
  loading: boolean;
  downloading: boolean;
  error: string | null;
  identity: number;
  frame: number;
  frameCount: number;
}
type AnimalCrossingToolState = Omit<
  AnimalCrossingSnapshot,
  keyof AnimalCrossingConversionSnapshot
> & {
  error: string | null;
};

export class AnimalCrossingManager {
  readonly viewport: ToolViewport;
  readonly ground: IslandPreviewManager;
  private state: AnimalCrossingToolState = {
    name: "",
    example: false,
    previewOpen: true,
    layout: AnimalCrossingLayout.Single,
    loading: false,
    downloading: false,
    error: null,
    identity: 0,
    frame: 0,
    frameCount: 1,
  };
  private readonly conversion = new AnimalCrossingConversion(
    defaultAnimalCrossingSettings(INITIAL_SIZE),
  );
  private snapshot: AnimalCrossingSnapshot;
  private tileDraft = defaultAnimalCrossingSettings(INITIAL_SIZE);
  private project: SessionProject | undefined;
  private request = 0;
  private closed = false;
  private listeners = new Set<() => void>();
  constructor(
    private readonly port: AnimalCrossingPort,
    groundPort?: IslandPreviewPort,
  ) {
    this.ground = new IslandPreviewManager(groundPort);
    this.viewport = new ToolViewport(port.readWheel);
    this.snapshot = this.readSnapshot();
  }
  getSnapshot = () => this.snapshot;
  setPreviewOpen(previewOpen: boolean) {
    this.update({ previewOpen });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private readSnapshot(): AnimalCrossingSnapshot {
    const conversion = this.conversion.getSnapshot();
    return { ...this.state, ...conversion, error: this.state.error ?? conversion.error };
  }
  private update(patch: Partial<AnimalCrossingToolState>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    this.snapshot = this.readSnapshot();
    this.ground.setDesign(
      this.snapshot.result,
      this.snapshot.selected,
      this.snapshot.source,
      this.snapshot.settings,
    );
    for (const listener of this.listeners) listener();
  }
  async open(file: File): Promise<void> {
    await this.openFile(file);
  }
  private async openFile(file: File): Promise<boolean> {
    if (this.closed || this.snapshot.downloading) return false;
    const request = ++this.request;
    this.conversion.clearError();
    this.update({ loading: true, error: null });
    try {
      const source = await this.port.read(file);
      if (this.closed || request !== this.request) return false;
      const rendered = source.project ? this.render(0, file.name, source.project) : null;
      const pixels = rendered?.pixels ?? source.pixels;
      const settings = rendered?.settings ?? defaultAnimalCrossingSettings(pixels);
      settings.title = source.pattern?.title ?? file.name.replace(/\.[^.]+$/, "");
      if (source.pattern) {
        settings.creator = source.pattern.creator;
        settings.town = source.pattern.town;
      }
      this.conversion.setSource(pixels, settings, source.pattern);
      this.tileDraft = { ...settings };
      this.project = source.project;
      this.update({
        name: file.name,
        example: false,
        layout:
          pixels.width > settings.cellWidth || pixels.height > settings.cellHeight
            ? AnimalCrossingLayout.Tiles
            : AnimalCrossingLayout.Single,
        frame: 0,
        frameCount: this.project?.timeline.frames.length ?? 1,
        identity: request,
        loading: false,
        error: null,
      });
      return true;
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.update({
          loading: false,
          error: String(reason instanceof Error ? reason.message : reason),
        });
      return false;
    }
  }
  private render(frame: number, name = this.snapshot.name, project = this.project!) {
    const document: EditorDocument = {
      name,
      width: project.image.width,
      height: project.image.height,
      timeline: project.timeline,
      palette: project.palette,
      selection: null,
      layer: { name: "", pixels: project.image, x: 0, y: 0, visible: true, locked: false },
    };
    return animalCrossingDocumentSource(document, frame);
  }
  setFrame(frame: number) {
    if (
      this.closed ||
      !this.project ||
      !Number.isInteger(frame) ||
      frame < 0 ||
      frame >= this.snapshot.frameCount
    )
      return;
    try {
      this.conversion.setSource(this.render(frame).pixels);
      this.update({ frame, error: null });
    } catch (reason) {
      this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  setLayout(layout: AnimalCrossingLayout) {
    const source = this.snapshot.source;
    if (this.closed || !source || this.snapshot.importedQr || this.snapshot.layout === layout)
      return;
    if (layout === AnimalCrossingLayout.Single) this.tileDraft = { ...this.snapshot.settings };
    const geometry =
      layout === AnimalCrossingLayout.Single
        ? {
            cellWidth: source.width,
            cellHeight: source.height,
            offsetX: 0,
            offsetY: 0,
            spacingX: 0,
            spacingY: 0,
          }
        : {
            cellWidth: this.tileDraft.cellWidth,
            cellHeight: this.tileDraft.cellHeight,
            offsetX: this.tileDraft.offsetX,
            offsetY: this.tileDraft.offsetY,
            spacingX: this.tileDraft.spacingX,
            spacingY: this.tileDraft.spacingY,
          };
    this.changeSettings(geometry);
    this.update({ layout });
  }
  getGrid(converted: boolean) {
    const pixels = converted ? this.snapshot.result?.pixels : this.snapshot.source;
    if (!pixels) return null;
    try {
      return animalCrossingGrid(
        pixels,
        converted ? defaultAnimalCrossingSettings(pixels) : this.snapshot.settings,
      );
    } catch {
      return null;
    }
  }
  changeSettings(patch: Partial<AnimalCrossingSettings>) {
    if (this.closed || this.snapshot.importedQr) return;
    this.conversion.changeSettings(patch);
    this.update({ error: null });
  }
  generate() {
    if (
      this.closed ||
      this.snapshot.loading ||
      this.snapshot.downloading ||
      this.snapshot.importedQr
    )
      return;
    this.conversion.generate();
    this.update({ error: null });
  }
  select(selected: number) {
    if (this.closed) return;
    const snapshot = this.conversion.getSnapshot();
    this.conversion.select(selected);
    if (snapshot !== this.conversion.getSnapshot()) this.update({});
  }
  async download() {
    const { result, name } = this.snapshot;
    if (this.closed || !result || this.snapshot.loading || this.snapshot.downloading) return;
    this.update({ downloading: true, error: null });
    try {
      await this.port.save(result, `${name.replace(/\.[^.]+$/, "")}-animal-crossing.zip`);
    } catch (reason) {
      this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      this.update({ downloading: false });
    }
  }
  async downloadQr() {
    const { qr, result, selected } = this.snapshot;
    const pattern = result?.patterns[selected];
    if (this.closed || !qr || !pattern || this.snapshot.loading || this.snapshot.downloading)
      return;
    this.update({ downloading: true, error: null });
    try {
      await this.port.saveQr(qr, `r${pattern.row + 1}-c${pattern.column + 1}-qr.png`);
    } catch (reason) {
      this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      this.update({ downloading: false });
    }
  }
  async openExample() {
    if (this.closed || this.snapshot.downloading) return;
    const request = this.request;
    try {
      const file = await this.port.example();
      if (this.closed || request !== this.request) return;
      const opened = await this.openFile(file);
      if (opened && !this.closed && this.snapshot.source && !this.snapshot.error) {
        this.update({ example: true });
        this.changeSettings({ title: EXAMPLE_TITLE, creator: EXAMPLE_CREATOR, town: "Bywater" });
        this.generate();
      }
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  dispose() {
    this.closed = true;
    this.ground.dispose();
    this.request++;
    this.listeners.clear();
  }
}
