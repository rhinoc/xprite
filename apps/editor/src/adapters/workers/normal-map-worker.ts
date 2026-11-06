import {
  NormalMapProcessingOperation,
  NormalMapProcessingFailure,
  type NormalMapProcessingInput,
} from "$/managers/ports/normal-map-processing";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  createNormalMapGenerator,
  prepareNormalMapLighting,
  renderPreparedNormalMapLighting,
  type PreparedNormalMapLighting,
} from "@xprite/editor-core/image-editing";

export type NormalMapWorkerRequest = { id: number } & (
  | (Omit<
      Extract<NormalMapProcessingInput, { operation: NormalMapProcessingOperation.Generate }>,
      "source"
    > & { source?: PixelBuffer })
  | {
      operation: NormalMapProcessingOperation.Light;
      textures?: { source: PixelBuffer; normals: PixelBuffer | null };
      options: Extract<
        NormalMapProcessingInput,
        { operation: NormalMapProcessingOperation.Light }
      >["options"];
    }
);
export type NormalMapWorkerResponse = { id: number } & (
  | { pixels: PixelBuffer }
  | { error: string }
);
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<NormalMapWorkerRequest>) => void,
  ): void;
  postMessage(message: NormalMapWorkerResponse, transfer?: Transferable[]): void;
}
const scope = globalThis as unknown as WorkerScope;
let prepared: PreparedNormalMapLighting | null = null;
let generator: ReturnType<typeof createNormalMapGenerator> | null = null;
scope.addEventListener("message", ({ data }) => {
  try {
    let pixels: PixelBuffer;
    if (data.operation === NormalMapProcessingOperation.Generate) {
      if (data.source) generator = createNormalMapGenerator(data.source);
      if (!generator) throw new Error(NormalMapProcessingFailure.SourceUnavailable);
      pixels = generator.generate(data.options);
    } else {
      if (data.textures)
        prepared = prepareNormalMapLighting(data.textures.source, data.textures.normals);
      if (!prepared) throw new Error(NormalMapProcessingFailure.SourceUnavailable);
      pixels = renderPreparedNormalMapLighting(prepared, data.options);
    }
    scope.postMessage({ id: data.id, pixels }, [pixels.data.buffer as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
