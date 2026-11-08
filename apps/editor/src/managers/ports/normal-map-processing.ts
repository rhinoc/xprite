import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  LightMaskOptions,
  NormalMapOptions,
  NormalMapLightOptions,
} from "@xprite/editor-core/image-editing";

export enum NormalMapProcessingOperation {
  Generate = "generate",
  GenerateMask = "generate-mask",
  Light = "light",
}
export enum NormalMapProcessingFailure {
  SourceUnavailable = "source-unavailable",
}
export type NormalMapProcessingInput =
  | {
      operation: NormalMapProcessingOperation.Generate;
      source: PixelBuffer;
      shading: PixelBuffer | null;
      options: NormalMapOptions;
      suggestPaintedLightAngle?: boolean;
    }
  | {
      operation: NormalMapProcessingOperation.GenerateMask;
      source: PixelBuffer;
      options: LightMaskOptions;
    }
  | {
      operation: NormalMapProcessingOperation.Light;
      source: PixelBuffer;
      normals: PixelBuffer | null;
      mask: PixelBuffer | null;
      options: NormalMapLightOptions;
    };
export interface NormalMapProcessingResult {
  pixels: PixelBuffer;
  suggestedPaintedLightAngle?: number | null;
}
export interface NormalMapProcessingPort {
  process(input: NormalMapProcessingInput): Promise<NormalMapProcessingResult>;
  dispose(): void;
}
export type NormalMapProcessingFactory = () => NormalMapProcessingPort;
