import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "$/base/utils/cn";

import styles from "$/components/input/text-area.module.css";

/** Native multiline text keeps selection and OS copy menus available on touch devices. */
export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
  return (
    <textarea {...props} ref={ref} data-slot="text-area" className={cn(styles.root, className)} />
  );
});
