import { debugInput } from "$/adapters/input/debug-input-log";
import { connectStylusTouchDefaults } from "@xprite/ui/utils";

/** Canvas policy stays with its manager; WebKit touch handling is shared with UI controls. */
export function connectBrowserStylusTouchDefaults(
  target: HTMLElement,
  shouldPreventDefault: () => boolean,
): () => void {
  return connectStylusTouchDefaults(target, shouldPreventDefault, (event, touches) => {
    debugInput("stylus-touch-default-prevented", undefined, {
      eventTimeStamp: event.timeStamp,
      extra: {
        identifiers: touches.map((touch) => touch.identifier),
        defaultPrevented: event.defaultPrevented,
      },
    });
  });
}
