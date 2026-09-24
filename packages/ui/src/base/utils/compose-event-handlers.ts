import type { SyntheticEvent } from "react";

/** Preserve handler order and the propagation boundary when sharing a DOM element. */
export function composeEventHandlers<Event extends SyntheticEvent>(
  first: ((event: Event) => void) | undefined,
  second: ((event: Event) => void) | undefined,
): (event: Event) => void {
  return (event) => {
    first?.(event);
    if (!event.isPropagationStopped()) second?.(event);
  };
}
