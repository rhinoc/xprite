import type { PixelBuffer } from "@xprite/editor-core/base";
import type { NormalMapOptions, NormalMapLightOptions } from "@xprite/editor-core/image-editing";

export enum NormalMapProcessingOperation {
  Generate = "generate",
  Light = "light",
}
export enum NormalMapProcessingFailure {
  SourceUnavailable = "source-unavailable",
}
export type NormalMapProcessingInput =
  | {
      operation: NormalMapProcessingOperation.Generate;
      source: PixelBuffer;
      options: NormalMapOptions;
    }
  | {
      operation: NormalMapProcessingOperation.Light;
      source: PixelBuffer;
      normals: PixelBuffer | null;
      options: NormalMapLightOptions;
    };
export interface NormalMapProcessingPort {
  process(input: NormalMapProcessingInput): Promise<PixelBuffer>;
  dispose(): void;
}
export type NormalMapProcessingFactory = () => NormalMapProcessingPort;
