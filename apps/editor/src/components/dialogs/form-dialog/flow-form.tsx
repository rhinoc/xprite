import { Fragment, useEffect, useRef } from "react";

import type { FormDialogProps, FormField } from "$/components/dialogs/form-dialog";
import { useElementSize } from "$/components/shared/use-size";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { WorkspaceLink, WorkspaceLinkVariant } from "$/components/workspace/workspace-link";
import { tUi, tUiSource } from "$/i18n";
import {
  Button,
  ButtonVariant,
  Checkbox,
  Combobox,
  Divider,
  Input,
  Text,
  TextVariant,
  type SurfaceBounds,
} from "@xprite/ui";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import { measurePopoverAnchor } from "@xprite/ui/popover";

import styles from "$/components/dialogs/form-dialog/flow-form.module.css";

const CONTROL_HEIGHT = 32;
const FALLBACK_CONTROL_WIDTH = 180;
const BROWSE_BUTTON_WIDTH = 28;
const BROWSE_BUTTON_GAP = 4;
const FORM_PADDING = 8;
const FORM_SEPARATOR_HEIGHT = 22;

function FlowField({
  field,
  onColorClick,
}: {
  field: FormField;
  onColorClick: (field: FormField, anchor: SurfaceBounds) => void;
}) {
  const control = useRef<HTMLDivElement>(null);
  const size = useElementSize(control);
  const width = size.width || FALLBACK_CONTROL_WIDTH;
  const pixelSize = { width: width / RASTER_SCALE, height: CONTROL_HEIGHT / RASTER_SCALE };
  const label = (
    <Text variant={TextVariant.Inline} scale={RASTER_SCALE} wrap>
      {tUiSource(field.label)}
    </Text>
  );
  if (field.type === "label") return <div className={styles.standalone}>{label}</div>;
  if (field.type === "checkbox")
    return (
      <div className={styles.standalone}>
        <Checkbox
          label={field.label}
          checked={field.value}
          disabled={field.disabled}
          onCheckedChange={field.onChange}
        />
      </div>
    );
  if (field.type === "button")
    return (
      <div className={styles.standalone}>
        <Button
          variant={field.icon ? ButtonVariant.FlatIcon : ButtonVariant.Standard}
          icon={field.icon}
          text={field.icon ? undefined : field.label}
          label={field.icon ? field.label : undefined}
          aria-label={field.label}
          aria-expanded={field.expanded}
          disabled={field.disabled}
          onClick={field.onClick}
        />
      </div>
    );
  if (field.type === "link")
    return (
      <div className={styles.standalone}>
        <WorkspaceLink
          layout="flow"
          variant={WorkspaceLinkVariant.Inline}
          bounds={{ x: 0, y: 0, width, height: CONTROL_HEIGHT }}
          onClick={field.onClick}
          disabled={field.disabled}
        >
          {field.label}
        </WorkspaceLink>
      </div>
    );
  const commit = (draft: string) => {
    if (field.type === "text" || field.type === "filename") field.onChange(draft);
    else if (field.type === "number") {
      const value = Number(draft);
      if (draft.trim() && Number.isFinite(value))
        field.onChange(
          Math.max(
            field.min ?? -Infinity,
            Math.min(
              field.max ?? Infinity,
              field.step
                ? Math.round((value - (field.min ?? 0)) / field.step) * field.step +
                    (field.min ?? 0)
                : value,
            ),
          ),
        );
    }
  };
  return (
    <div className={styles.field}>
      <div className={styles.caption}>{label}</div>
      <div ref={control} className={styles.control}>
        {field.type === "color" ? (
          <EditorColorButton
            pixelSize={pixelSize}
            value={field.value}
            aria-label={field.label || field.key}
            disabled={field.disabled}
            onClick={(event) =>
              onColorClick(field, measurePopoverAnchor(event.currentTarget).bounds)
            }
          />
        ) : field.type === "select" ? (
          <Combobox
            pixelSize={pixelSize}
            aria-label={field.label}
            options={field.options}
            value={field.value}
            onValueChange={field.onChange}
            disabled={field.disabled}
            editable={field.editable}
            suffix={field.suffix}
          />
        ) : (
          <Input
            pixelSize={
              field.type === "filename"
                ? {
                    ...pixelSize,
                    width:
                      Math.max(1, width - BROWSE_BUTTON_WIDTH - BROWSE_BUTTON_GAP) / RASTER_SCALE,
                  }
                : pixelSize
            }
            aria-label={field.label || field.key}
            disabled={field.disabled}
            value={String(field.value)}
            inputMode={field.type === "number" ? "decimal" : "text"}
            onValueChange={field.type === "text" ? field.onChange : undefined}
            onCommit={commit}
          />
        )}
        {field.type === "filename" && (
          <Button
            pixelSize={{
              width: BROWSE_BUTTON_WIDTH / RASTER_SCALE,
              height: CONTROL_HEIGHT / RASTER_SCALE,
            }}
            text="..."
            aria-label={tUi("ui.choose.2", { value1: tUiSource(field.label || "output file") })}
            disabled={field.disabled || !field.onBrowse}
            onClick={field.onBrowse}
          />
        )}
      </div>
    </div>
  );
}

/** Flow layout for generic forms and authored forms that cannot fit the viewport. */
export function FlowForm({
  fields,
  message,
  actions,
  layout,
  onHeightChange,
  onColorClick,
}: Pick<FormDialogProps, "fields" | "actions" | "layout"> & {
  message?: string;
  onHeightChange: (height: number) => void;
  onColorClick: (field: FormField, anchor: SurfaceBounds) => void;
}) {
  const rows = [...new Set(fields.map((field) => field.row ?? field.key))];
  const form = useRef<HTMLDivElement>(null);
  const size = useElementSize(form);
  useEffect(() => {
    if (size.height > 0) onHeightChange(size.height);
  }, [size.height, onHeightChange]);
  const separators = (layout?.separators ?? [])
    .filter((separator) => !separator.vertical)
    .map((separator) => {
      const next = fields.find((field) => (layout?.fields[field.key]?.y ?? 0) > separator.y);
      return { ...separator, before: next ? (next.row ?? next.key) : undefined };
    });
  const renderSeparators = (before?: string) =>
    separators
      .filter((separator) => separator.before === before)
      .map((separator, index) => (
        <Divider
          key={`${separator.y}-${index}`}
          text={separator.text}
          pixelSize={{
            width: Math.max(0, size.width - FORM_PADDING * 2) / RASTER_SCALE,
            height: FORM_SEPARATOR_HEIGHT / RASTER_SCALE,
          }}
        />
      ));
  return (
    <div ref={form} className={styles.form}>
      {message && (
        <Text variant={TextVariant.Inline} scale={RASTER_SCALE} wrap>
          {message}
        </Text>
      )}
      {rows.map((row) => (
        <Fragment key={row}>
          {renderSeparators(row)}
          <div className={styles.row}>
            {fields
              .filter((field) => (field.row ?? field.key) === row)
              .map((field) => (
                <FlowField key={field.key} field={field} onColorClick={onColorClick} />
              ))}
          </div>
        </Fragment>
      ))}
      {renderSeparators()}
      <div className={styles.actions}>
        {actions.map((action, index) => (
          <Button
            key={`${action.label}-${index}`}
            text={action.label}
            data-ui-form-action={action.label}
            disabled={action.disabled}
            onClick={action.onClick}
          />
        ))}
      </div>
    </div>
  );
}
