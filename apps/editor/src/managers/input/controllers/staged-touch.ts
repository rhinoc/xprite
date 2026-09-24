import { PointerDragActivation } from "@xprite/ui/utils";

type TouchPointerPosition = { clientX: number; clientY: number; pointerType: string };

/** Delay object editing until a finger's tap/drag intent is known. */
export class StagedTouchIntent {
  private readonly activation: PointerDragActivation;

  constructor(
    start: TouchPointerPosition,
    private readonly startsInside: boolean,
  ) {
    this.activation = new PointerDragActivation(start);
  }
  tap(): "edit" | "pan" {
    return this.startsInside ? "edit" : "pan";
  }
  move(point: Pick<TouchPointerPosition, "clientX" | "clientY">): "wait" | "edit" | "pan" {
    if (!this.activation.update(point)) return "wait";
    return this.startsInside ? "edit" : "pan";
  }
}
