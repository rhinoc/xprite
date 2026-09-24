import { useEffect, useState } from "react";

/** Keep the latest resize update per frame, with an explicit final flush. */
export class WorkspaceResizeScheduler {
  private frame: number | null = null;
  private pending: (() => void) | null = null;

  constructor(
    private readonly request: (callback: () => void) => number,
    private readonly cancelFrame: (frame: number) => void,
  ) {}

  schedule = (update: () => void) => {
    this.pending = update;
    if (this.frame === null) this.frame = this.request(this.flush);
  };

  flush = () => {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    const update = this.pending;
    this.pending = null;
    update?.();
  };

  cancel = () => {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.pending = null;
  };
}

export function useWorkspaceResizeScheduler() {
  const [scheduler] = useState(
    () =>
      new WorkspaceResizeScheduler(
        (callback) => window.requestAnimationFrame(callback),
        (frame) => window.cancelAnimationFrame(frame),
      ),
  );
  useEffect(() => () => scheduler.flush(), [scheduler]);
  return scheduler;
}
