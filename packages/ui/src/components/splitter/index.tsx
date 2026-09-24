import { forwardRef, type HTMLAttributes } from "react";

import { stylusPointerInputProps } from "$/base/utils/stylus-input";

import styles from "$/components/splitter/splitter.module.css";

export type SplitterAxis = "horizontal" | "vertical";

export interface SplitterProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "role" | "aria-orientation" | "children"
> {
  /** Direction in which the splitter divides the surrounding content. */
  axis: SplitterAxis;
}

/** Focusable separator primitive. Resize policy and state belong to the caller. */
export const Splitter = forwardRef<HTMLDivElement, SplitterProps>(function Splitter(
  { axis, className, tabIndex, ...props },
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
      aria-orientation={axis === "horizontal" ? "vertical" : "horizontal"}
      data-axis={axis}
    />
  );
});
