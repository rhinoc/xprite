import { useEffect, useRef, type HTMLAttributes } from "react";

import { connectWindowWorkspace } from "$/base/utils/window-workspace";

import "$/components/window-workspace/workspace.module.css";

/** Window activation, movement and stacking within a layout-neutral container. */
export function WindowWorkspace(props: HTMLAttributes<HTMLDivElement>) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => (host.current ? connectWindowWorkspace(host.current) : undefined), []);
  return <div {...props} ref={host} data-ui-desktop-workspace />;
}
