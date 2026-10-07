import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ThemeScope } from "$/base/theme/theme-scope";
import { borderSize, observeResize, type GeometrySize } from "$/base/utils/dom-geometry";
import { WindowVariant } from "$/components/window/variants/window";
import type { WindowVariantContext, WindowVariantProps } from "$/components/window/variants/window";

import styles from "$/components/window/dialog-portal.module.css";

export type DialogContext = WindowVariantContext;
export interface DialogProps extends WindowVariantProps {
  /** Use the viewport for a page-level window opened from a bounded toolbar/menu. */
  portal?: boolean;
}

/** Movable, resizable themed dialog; scene-owned windows keep their existing host. */
function PortalWindow(props: WindowVariantProps) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<GeometrySize>();
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const update = () => {
      const next = borderSize(node);
      setSize((previous) =>
        previous?.width === next.width && previous.height === next.height ? previous : next,
      );
    };
    update();
    return observeResize([node], update);
  }, []);
  return (
    <div className={styles.root} ref={root}>
      {size && <WindowVariant {...props} sceneBounds={props.sceneBounds ?? size} />}
    </div>
  );
}

export function Dialog({ portal = false, ...props }: DialogProps) {
  const content = <WindowVariant {...props} />;
  if (!portal || typeof document === "undefined") return content;
  return createPortal(
    <ThemeScope>
      <PortalWindow {...props} />
    </ThemeScope>,
    document.body,
  );
}
