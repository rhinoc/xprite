import type { AnchorHTMLAttributes, CSSProperties, HTMLAttributes, Ref } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { ListBoxFrame } from "$/components/list-box/frame";
import { ScrollArea, type ScrollAreaProps } from "$/components/scrollbar";

import styles from "$/components/list-box/navigation.module.css";

export interface NavigationListItem extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> {
  href: string;
  label: string;
}

export interface NavigationListProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  items: readonly NavigationListItem[];
  activeHref?: string;
  /** Use the theme's input frame around the native links and their scrollbar. */
  framed?: boolean;
  scrollViewportRef?: Ref<HTMLDivElement>;
  viewportProps?: ScrollAreaProps["viewportProps"];
  reserveScrollbarGutter?: boolean;
}

const FRAME_INSET = 6;

/** A reading list of real links; Tab, modifiers and navigation stay native. */
export function NavigationList({
  items,
  activeHref,
  framed = false,
  scrollViewportRef,
  viewportProps,
  reserveScrollbarGutter = false,
  className,
  style,
  ...props
}: NavigationListProps) {
  const { definition, translateSource } = useTheme();
  const skin = definition.controlParts?.listBox;
  return (
    <nav
      {...props}
      className={cn(styles.root, className)}
      data-ui-navigation-list=""
      data-framed={framed || undefined}
      style={
        {
          "--ui-navigation-list-frame-inset": `${framed ? (skin?.contentInset ?? FRAME_INSET) : 0}px`,
          ...style,
        } as CSSProperties
      }
    >
      {framed && <ListBoxFrame />}
      <ScrollArea
        className={styles.scroll}
        scrollX={false}
        reserveScrollbarGutter={reserveScrollbarGutter}
        viewportRef={scrollViewportRef}
        viewportProps={viewportProps}
        aria-label={props["aria-label"]}
      >
        <ul data-slot="navigation-list-items">
          {items.map(({ href, label, className: itemClassName, ...itemProps }) => (
            <li key={href}>
              <a
                {...itemProps}
                href={href}
                className={itemClassName}
                data-slot="navigation-list-link"
                aria-current={
                  itemProps["aria-current"] ?? (href === activeHref ? "location" : undefined)
                }
              >
                {translateSource(label)}
              </a>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </nav>
  );
}
