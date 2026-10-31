import {
  PixelationWorkerOperation,
  type PixelationWorkerRequest,
  type PixelationWorkerResponse,
} from "$/adapters/pixelation/worker-protocol";
import { pixelateImage, detectWithAlgorithm } from "@xprite/pixelate";
interface Scope {
  onmessage: ((event: MessageEvent<PixelationWorkerRequest>) => void) | null;
  postMessage(message: PixelationWorkerResponse, transfer?: Transferable[]): void;
}
const scope = globalThis as unknown as Scope;
scope.onmessage = ({ data }) => {
  try {
    if (data.operation === PixelationWorkerOperation.DetectGrid) {
      scope.postMessage({ grid: detectWithAlgorithm(data.image, data.algorithm, data.size) });
      return;
    }
    const pixels = pixelateImage(data.image, data.options);
    scope.postMessage({ pixels }, [pixels.data.buffer as ArrayBuffer]);
  } catch (reason) {
    scope.postMessage({ error: reason instanceof Error ? reason.message : String(reason) });
  }
};
