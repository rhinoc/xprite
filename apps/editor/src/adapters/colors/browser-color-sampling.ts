import type { ColorSamplingPort } from "$/managers/ports/color-sampling";
import { browserEyeDropper } from "@xprite/bedrock/browser/eyedropper";
import { hitElement, clientPoint } from "@xprite/ui/utils";

import styles from "$/adapters/colors/color-sampling.module.css";

export const browserColorSampling: ColorSamplingPort = {
  screenAvailable: () => browserEyeDropper.available(),
  pickScreen: (signal) => browserEyeDropper.pick(signal),
  hitTest: (point) => hitElement({ x: point.x, y: point.y }, document),
  captureDrag(element, pointerId, callbacks) {
    const owner = element.ownerDocument;
    const view = owner.defaultView;
    let active = true;
    const point = (event: PointerEvent) => ({ x: clientPoint(event).x, y: clientPoint(event).y });
    const cleanup = () => {
      active = false;
      owner.removeEventListener("pointermove", move, true);
      owner.removeEventListener("pointerup", finish, true);
      owner.removeEventListener("pointercancel", cancelPointer, true);
      owner.removeEventListener("keydown", key, true);
      element.removeEventListener("lostpointercapture", cancelPointer);
      view?.removeEventListener("blur", cancel);
      owner.documentElement.classList.remove(styles.sampling);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      if (!active) return;
      cleanup();
      callbacks.cancel();
    };
    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancel();
    };
    const move = (event: PointerEvent) => {
      if (!active || event.pointerId !== pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.move(point(event));
    };
    const finish = (event: PointerEvent) => {
      if (!active || event.pointerId !== pointerId) return;
      // Let the button receive pointerup so its pressed appearance resets.
      cleanup();
      callbacks.finish(point(event));
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    element.setPointerCapture(pointerId);
    owner.documentElement.classList.add(styles.sampling);
    owner.addEventListener("pointermove", move, true);
    owner.addEventListener("pointerup", finish, true);
    owner.addEventListener("pointercancel", cancelPointer, true);
    owner.addEventListener("keydown", key, true);
    element.addEventListener("lostpointercapture", cancelPointer);
    view?.addEventListener("blur", cancel);
    return cancel;
  },
};
