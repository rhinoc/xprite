import {
  NormalMapProcessingOperation,
  NormalMapProcessingFailure,
  type NormalMapProcessingInput,
  type NormalMapProcessingResult,
} from "$/managers/ports/normal-map-processing";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  createNormalMapGenerator,
  createLightMaskGenerator,
  prepareNormalMapLighting,
  renderPreparedNormalMapLighting,
  type PreparedNormalMapLighting,
} from "@xprite/editor-core/image-editing";

export type NormalMapWorkerRequest = { id: number } & (
  | (Omit<
      Extract<NormalMapProcessingInput, { operation: NormalMapProcessingOperation.Generate }>,
      "source" | "shading"
    > & { source?: PixelBuffer; shading?: PixelBuffer | null })
  | (Omit<
      Extract<NormalMapProcessingInput, { operation: NormalMapProcessingOperation.GenerateMask }>,
      "source"
    > & { source?: PixelBuffer })
  | {
      operation: NormalMapProcessingOperation.Light;
      textures?: { source: PixelBuffer; normals: PixelBuffer | null; mask: PixelBuffer | null };
      options: Extract<
        NormalMapProcessingInput,
        { operation: NormalMapProcessingOperation.Light }
      >["options"];
    }
);
export type NormalMapWorkerResponse = { id: number } & (
  | NormalMapProcessingResult
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
let maskGenerator: ReturnType<typeof createLightMaskGenerator> | null = null;
scope.addEventListener("message", ({ data }) => {
  try {
    let pixels: PixelBuffer;
    let suggestedPaintedLightAngle: number | null | undefined;
    if (data.operation === NormalMapProcessingOperation.Generate) {
      if (data.source) generator = createNormalMapGenerator(data.source);
      if (!generator) throw new Error(NormalMapProcessingFailure.SourceUnavailable);
      if (data.shading !== undefined) generator.setShading(data.shading);
      if (data.suggestPaintedLightAngle && data.options.paintedLightInfluence > 0)
        suggestedPaintedLightAngle = generator.suggestPaintedLightAngle();
      pixels = generator.generate({
        ...data.options,
        paintedLightAngle: suggestedPaintedLightAngle ?? data.options.paintedLightAngle,
      });
    } else if (data.operation === NormalMapProcessingOperation.GenerateMask) {
      if (data.source) maskGenerator = createLightMaskGenerator(data.source);
      if (!maskGenerator) throw new Error(NormalMapProcessingFailure.SourceUnavailable);
      pixels = maskGenerator.generate(data.options);
    } else {
      if (data.textures)
        prepared = prepareNormalMapLighting(
          data.textures.source,
          data.textures.normals,
          data.textures.mask,
        );
      if (!prepared) throw new Error(NormalMapProcessingFailure.SourceUnavailable);
      pixels = renderPreparedNormalMapLighting(prepared, data.options);
    }
    scope.postMessage({ id: data.id, pixels, suggestedPaintedLightAngle }, [
      pixels.data.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
