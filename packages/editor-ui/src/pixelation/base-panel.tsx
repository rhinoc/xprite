import type { ReactNode } from "react";

import {
  PixelationSlot,
  usePixelationBase,
  type PixelationBaseProps,
} from "$/pixelation/base-controls";
import { pixelationAdvancedLabel } from "$/pixelation/base-labels";
import { ContentLayout, ContentPadding, Disclosure, Field, FieldLayout, Panel } from "@xprite/ui";

import styles from "$/pixelation/pixelation.module.css";

const SIZE_WIDTH = 72;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      contentGap={4}
      title={title}
      className={styles.group}
    >
      <div className={styles.groupRow}>{children}</div>
    </Panel>
  );
}

/**
 * The shared base controls in the tool pages' flow layout: titled group boxes that sit side by side
 * in the adjust panel. `children` are the page's own controls, shown after the base ones.
 */
export function PixelationBaseControls({
  children,
  ...props
}: PixelationBaseProps & { children?: ReactNode }) {
  const base = usePixelationBase(props);
  const { translate } = props;
  const field = (slot: PixelationSlot, pixelWidth?: number) => {
    const view = base[slot];
    return view.visible ? (
      <Field
        key={slot}
        label={view.label ?? undefined}
        layout={FieldLayout.Inline}
        className={styles.inlineField}
      >
        {view.render(undefined, pixelWidth)}
      </Field>
    ) : null;
  };
  const bare = (slot: PixelationSlot) =>
    base[slot].visible ? <span key={slot}>{base[slot].render()}</span> : null;
  return (
    <div className={styles.controls}>
      <Group title={translate("Pixels")}>
        {field(PixelationSlot.Algorithm)}
        {field(PixelationSlot.Width, SIZE_WIDTH)}
        {field(PixelationSlot.Height, SIZE_WIDTH)}
        {field(PixelationSlot.ColorPicker)}
      </Group>
      {(base[PixelationSlot.LimitColors].visible || base[PixelationSlot.Palette].visible) && (
        <Group title={translate("Colors")}>
          {bare(PixelationSlot.LimitColors)}
          {field(PixelationSlot.Colors)}
          {base[PixelationSlot.Palette].visible && (
            <div className={styles.palette}>{base[PixelationSlot.Palette].render()}</div>
          )}
        </Group>
      )}
      {children}
      <Disclosure title={translate(pixelationAdvancedLabel.text)} className={styles.advanced}>
        <div className={styles.groupRow}>
          {bare(PixelationSlot.Prepass)}
          {bare(PixelationSlot.PrepassPreset)}
        </div>
      </Disclosure>
    </div>
  );
}
