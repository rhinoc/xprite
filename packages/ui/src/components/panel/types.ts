import type { HTMLAttributes, ReactNode } from "react";

import type { SurfaceContentProps } from "$/components/surface/content";

export enum PanelGroupBorder {
  Etched = "primary",
  Single = "secondary",
}

export interface PanelGroupProps
  extends Omit<HTMLAttributes<HTMLElement>, "title">, SurfaceContentProps {
  title?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  groupBorder?: PanelGroupBorder;
}
