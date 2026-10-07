import type { ToolWheelInput } from "$/managers/ports/preview";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { SessionProject } from "@xprite/editor-core/session";
import type { AppearanceMode } from "@xprite/editor-ui/appearance";

/** Browser resources owned by the viewer, separate from editor persistence. */
export interface ViewerPort {
  readWheel(event: WheelEvent): ToolWheelInput;
  readAppearance(): AppearanceMode;
  watchAppearance(listener: (mode: AppearanceMode) => void): () => void;
  read(file: File): Promise<SessionProject>;
  example(): Promise<File>;
  saveFrame(pixels: PixelBuffer, name: string): Promise<void>;
  saveAnimation(bytes: Uint8Array, name: string): Promise<void>;
  edit(file: File): Promise<void>;
}
