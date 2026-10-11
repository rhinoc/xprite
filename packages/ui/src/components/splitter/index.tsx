import { forwardRef, type HTMLAttributes } from "react";

import { stylusPointerInputProps } from "$/base/utils/stylus-input";

import styles from "$/components/splitter/splitter.module.css";

export enum SplitterDirection {
  Horizontal = "horizontal",
  Vertical = "vertical",
}

export interface SplitterProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "role" | "aria-orientation" | "children"
> {
  /** Direction in which the splitter divides the surrounding content. */
  direction: SplitterDirection;
}

/** Focusable separator primitive. Resize policy and state belong to the caller. */
export const Splitter = forwardRef<HTMLDivElement, SplitterProps>(function Splitter(
  { direction, className, tabIndex, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      {...stylusPointerInputProps()}
      className={className ? `${styles.splitter} ${className}` : styles.splitter}
      role="separator"
      tabIndex={tabIndex ?? 0}
      aria-orientation={direction === SplitterDirection.Horizontal ? "vertical" : "horizontal"}
      data-axis={direction}
    />
  );
});
