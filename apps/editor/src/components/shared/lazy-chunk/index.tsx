import { lazy, useEffect, type ComponentType, type LazyExoticComponent } from "react";

import { loadChunk } from "$/managers/pwa/chunk-load";

interface DismissProps {
  onClose?: unknown;
  onCancel?: unknown;
  onOpenChange?: unknown;
}

/**
 * Renders nothing where a chunk could not be loaded; the update notice explains why. A dialog
 * that was opened for it is dismissed through its own close callback, so the editor does not
 * stay behind an invisible modal state.
 */
function UnavailableChunk(props: DismissProps) {
  const { onClose, onCancel, onOpenChange } = props;
  useEffect(() => {
    if (typeof onClose === "function") onClose();
    else if (typeof onCancel === "function") onCancel();
    else if (typeof onOpenChange === "function") onOpenChange(false);
    // The failure is final for this page; dismiss once on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * React.lazy for build chunks. A failed import is retried once. If it still fails (usually an
 * open tab whose release was replaced), the failure is reported and the component renders
 * nothing instead of throwing into the error boundary, so unsaved work stays on screen.
 */
export function lazyChunk<C extends ComponentType<any>>(
  load: () => Promise<{ default: C }>,
): LazyExoticComponent<C> {
  return lazy(() => loadChunk(load).catch(() => ({ default: UnavailableChunk as unknown as C })));
}
