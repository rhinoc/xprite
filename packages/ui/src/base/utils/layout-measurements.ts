interface PendingMeasurements {
  callbacks: Set<() => void>;
  frame: number;
}
const pending = new WeakMap<Window, PendingMeasurements>();

/** Coalesce geometry reads from nested controls into one animation frame. */
export function queueLayoutMeasurement(host: Window, callback: () => void) {
  let batch = pending.get(host);
  if (!batch) {
    batch = { callbacks: new Set(), frame: 0 };
    pending.set(host, batch);
  }
  batch.callbacks.add(callback);
  if (batch.frame) return;
  const current = batch;
  current.frame = host.requestAnimationFrame(() => {
    current.frame = 0;
    const callbacks = [...current.callbacks];
    current.callbacks.clear();
    for (const measure of callbacks) measure();
  });
}

export function cancelLayoutMeasurement(host: Window, callback: () => void) {
  const batch = pending.get(host);
  if (!batch) return;
  batch.callbacks.delete(callback);
  if (!batch.callbacks.size && batch.frame) {
    host.cancelAnimationFrame(batch.frame);
    batch.frame = 0;
  }
}
