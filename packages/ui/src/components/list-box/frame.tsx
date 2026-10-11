import type { HTMLAttributes } from "react";

import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { listBoxBorderStyle } from "$/components/list-box/border";
import { ListBoxBorderStyle, type ListBoxPresentationProps } from "$/components/list-box/types";

import styles from "$/components/list-box/list-box.module.css";

const FRAME_ARTWORK_SCALE = 2;
const SINGLE_FRAME_BORDER_WIDTH = 1;

/** The input frame shared by selection lists and native-link navigation lists. */
export function ListBoxFrame({
  border = true,
  focused = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  border?: ListBoxPresentationProps["border"];
  focused?: boolean;
}) {
  const { definition } = useTheme();
  const skin = definition.controlParts?.listBox;
  const borderStyle = listBoxBorderStyle(border);
  if (borderStyle === undefined) return null;
  if (borderStyle === ListBoxBorderStyle.Thick)
    return (
      <ThemePart
        {...props}
        part={focused ? "editor_selected" : "editor_normal"}
        scale={FRAME_ARTWORK_SCALE}
        drawCenter={false}
        className={cn(styles.frame, className)}
      />
    );
  const single = borderStyle === ListBoxBorderStyle.Single;
  return (
    <span {...props} aria-hidden="true" className={cn(styles.frame, className)}>
      {single || skin ? (
        <>
          <span
            className={styles.innerFrame}
            style={{
              inset: 0,
              borderWidth: single ? SINGLE_FRAME_BORDER_WIDTH : skin?.borderWidth,
              borderColor: definition.colors.text,
            }}
          />
          {!single && skin && (
            <span
              className={styles.innerFrame}
              style={{
                inset: skin.innerInset,
                borderColor: definition.colors.text,
              }}
            />
          )}
        </>
      ) : (
        <ThemePart
          part="sunken_normal"
          scale={FRAME_ARTWORK_SCALE}
          drawCenter
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            background: definition.colors.window_face,
          }}
        />
      )}
    </span>
  );
}
