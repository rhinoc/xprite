import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "$/base/utils/cn";

import styles from "$/components/menu/navigation.module.css";

export interface MenubarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

/** A menu-bar command that opens a panel or performs an action. */
export function MenubarButton({
  icon = false,
  buttonRef,
  className,
  children,
  ...props
}: MenubarButtonProps) {
  return (
    <button
      {...props}
      ref={buttonRef}
      type={props.type ?? "button"}
      role="menuitem"
      className={cn(styles.link, className)}
      data-ui-menubar-link="true"
      data-icon={icon || undefined}
      data-open={props["aria-expanded"] === true || props["aria-expanded"] === "true" || undefined}
    >
      {children}
    </button>
  );
}
