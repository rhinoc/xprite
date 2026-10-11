import {
  useState,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { listBoxBorderStyle } from "$/components/list-box/border";
import { ListBoxFrame } from "$/components/list-box/frame";
import { ListBoxBorderStyle } from "$/components/list-box/types";
import { ListBoxMode, type ListBoxPresentationProps } from "$/components/list-box/types";
import {
  ScrollArea,
  ScrollbarRendering,
  type ScrollAreaElementProps,
} from "$/components/scrollbar";

import styles from "$/components/list-box/navigation.module.css";

export interface NavigationListBoxItem extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> {
  href: string;
  label: string;
}

export interface NavigationListBoxProps
  extends Omit<HTMLAttributes<HTMLElement>, "children">, ListBoxPresentationProps {
  mode: ListBoxMode.Navigation;
  items: readonly NavigationListBoxItem[];
  activeHref?: string;
  scrollViewportRef?: Ref<HTMLDivElement>;
  viewportProps?: ScrollAreaElementProps["viewportProps"];
  reserveScrollbarGutter?: boolean;
  scrollbarRendering?: ScrollbarRendering;
}

const FRAME_INSET = 6;
const THICK_BORDER_TOP_INSET = 8;
const THICK_BORDER_BOTTOM_INSET = 6;
const BORDER_WIDTH = 1;

/** A reading list of real links; Tab, modifiers and navigation stay native. */
export function NavigationListBox({
  mode: _mode,
  items,
  activeHref,
  border = true,
  scrollViewportRef,
  viewportProps,
  reserveScrollbarGutter = false,
  scrollbarRendering = ScrollbarRendering.Skinned,
  className,
  style,
  ...props
}: NavigationListBoxProps) {
  const { definition, translateSource } = useTheme();
  const skin = definition.controlParts?.listBox;
  const [focused, setFocused] = useState(false);
  const borderStyle = listBoxBorderStyle(border);
  const framed = borderStyle !== undefined;
  return (
    <nav
      {...props}
      className={cn(styles.root, className)}
      data-ui-navigation-list=""
      data-framed={framed || undefined}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={
        {
          "--ui-navigation-list-frame-inset":
            borderStyle === ListBoxBorderStyle.Thick
              ? `${THICK_BORDER_TOP_INSET}px ${FRAME_INSET}px ${THICK_BORDER_BOTTOM_INSET}px`
              : `${framed ? (borderStyle === ListBoxBorderStyle.Single ? BORDER_WIDTH : (skin?.contentInset ?? FRAME_INSET)) : 0}px`,
          ...style,
        } as CSSProperties
      }
    >
      {framed && <ListBoxFrame border={border} focused={focused} />}
      <ScrollArea
        scrollbarRendering={scrollbarRendering}
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
