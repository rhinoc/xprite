interface DismissalSubscription {
  callbacks: Set<() => void>;
  dismiss: () => void;
}

const subscriptions = new WeakMap<Window, DismissalSubscription>();

/** Only pending or visible tooltips share these window listeners. */
export function subscribeTooltipDismissal(host: Window, close: () => void): () => void {
  let subscription = subscriptions.get(host);
  if (!subscription) {
    const callbacks = new Set<() => void>();
    const dismiss = () => {
      for (const callback of Array.from(callbacks)) callback();
    };
    subscription = { callbacks, dismiss };
    subscriptions.set(host, subscription);
    host.addEventListener("keydown", dismiss, true);
    host.addEventListener("pointerdown", dismiss, true);
    host.addEventListener("blur", dismiss);
    host.addEventListener("resize", dismiss);
    host.addEventListener("scroll", dismiss, true);
  }
  const current = subscription;
  current.callbacks.add(close);
  return () => {
    if (!current.callbacks.delete(close) || current.callbacks.size) return;
    host.removeEventListener("keydown", current.dismiss, true);
    host.removeEventListener("pointerdown", current.dismiss, true);
    host.removeEventListener("blur", current.dismiss);
    host.removeEventListener("resize", current.dismiss);
    host.removeEventListener("scroll", current.dismiss, true);
    subscriptions.delete(host);
  };
}
