import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { FlowForm } from "$/components/dialogs/form-dialog/flow-form";
import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { IconControl } from "$/components/shared/icon-control";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { WorkspaceLink, WorkspaceLinkVariant } from "$/components/workspace/workspace-link";
import { tUiSource, useUiLanguage, tUi } from "$/i18n";
import type { FormLayout } from "$/managers/dialogs/form-layout";
import {
  Button,
  ButtonVariant,
  OverlayContentLayout,
  Checkbox,
  Combobox,
  Divider,
  Input,
  focusDialogContainer,
  isDialogPopupTarget,
  type ButtonProps,
  type SurfaceBounds,
  Text,
  TextVariant,
} from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";
import { isImeKeyboardEvent } from "@xprite/ui/utils";
type FieldBase = { key: string; label: string; disabled?: boolean; row?: string };
export type FormField = FieldBase &
  (
    | { type: "text"; value: string; onChange: (value: string) => void }
    | { type: "color"; value: string; onChange: (value: string) => void }
    | { type: "filename"; value: string; onChange: (value: string) => void; onBrowse?: () => void }
    | { type: "label" }
    | { type: "link"; onClick: () => void }
    | {
        type: "button";
        onClick: () => void;
        icon?: NonNullable<ButtonProps["icon"]>;
        expanded?: boolean;
      }
    | {
        type: "number";
        value: number;
        onChange: (value: number) => void;
        min?: number;
        max?: number;
        step?: number;
      }
    | { type: "checkbox"; value: boolean; onChange: (value: boolean) => void }
    | {
        type: "select";
        editable?: boolean;
        suffix?: string;
        value: string;
        onChange: (value: string) => void;
        options: readonly {
          label: string;
          value: string;
          disabled?: boolean;
        }[];
      }
  );
export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: readonly FormField[];
  message?: string;
  actions: readonly {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }[];
  /** Width in scene pixels, before the scene's display scale. */
  width?: number;
  layout?: FormLayout;
  /** Disable the default Enter-to-first-action behavior for search-like forms. */
  submitOnEnter?: boolean;
  /** Select the initial editable text input when the dialog opens. */
  selectInitialInput?: boolean;
  /** Extra source-positioned content inside the dialog client area. */
  content?: (clientBounds: SurfaceBounds) => ReactNode;
  helpUrl?: string;
  overlay?: ReactNode;
  headerActions?: readonly {
    label: string;
    icon: NonNullable<ButtonProps["icon"]>;
    x: number;
    y: number;
    width: number;
    height: number;
    onClick(): void;
    disabled?: boolean;
  }[];
  tabs?: {
    items: readonly { value: string; label: string }[];
    value: string;
    selectedValues?: readonly string[];
    onChange: (value: string) => void;
  };
}
const focusable = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';
const MESSAGE_PREFERRED_WIDTH = 640;
const MESSAGE_WIDTH_PADDING = 48;
const FORM_DIALOG_CHROME_HEIGHT = 46;
function wrapMessage(message: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of message.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (measureUiText(word) > width) {
        if (line) lines.push(line);
        line = "";
        for (const char of word) {
          const next = line + char;
          if (line && measureUiText(next) > width) {
            lines.push(line);
            line = char;
          } else line = next;
        }
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (line && measureUiText(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Source-skinned, modal field layout. Editing algorithms belong to the caller. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  fields,
  message,
  actions,
  width,
  tabs,
  layout,
  submitOnEnter = true,
  selectInitialInput = false,
  content,
  headerActions,
  helpUrl,
  overlay,
}: FormDialogProps) {
  const initializeFocus = useEditorDialogInitialFocus();
  useUiLanguage();
  const scene = useSceneBounds();
  const host = useRef<HTMLDivElement>(null);
  const portalMarker = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [colorFieldKey, setColorFieldKey] = useState<string | null>(null);
  const [colorAnchor, setColorAnchor] = useState<SurfaceBounds>();
  const [flowHeight, setFlowHeight] = useState<number | null>(null);
  const currentActions = useRef(actions);
  currentActions.current = actions;
  const close = useRef(onOpenChange);
  close.current = onOpenChange;
  useEffect(() => {
    const marker = portalMarker.current;
    if (marker) setPortalTarget(marker.closest<HTMLElement>("[data-ui-scene]") ?? document.body);
  }, []);
  // Content size hints for the label/entry row and dialog actions.
  // Explicit layouts may still request a preferred width in painter pixels.
  const displayMessage = message ? tUiSource(message) : undefined;
  const labelWidthHint = Math.max(
    0,
    ...fields.map((field) => measureUiText(tUiSource(field.label)) + 16),
  );
  const entryWidthHint = Math.max(
    measureUiText("000000000000") + 24,
    ...fields.map((field) =>
      field.type === "select"
        ? Math.max(0, ...field.options.map((option) => measureUiText(tUiSource(option.label)))) + 40
        : field.type === "number"
          ? measureUiText(String(field.max ?? field.value)) + 24
          : 0,
    ),
  );
  const actionWidthHint = actions.reduce(
    (total, action) => total + measureUiText(tUiSource(action.label)) + 40,
    0,
  );
  const preferredWidth =
    width ??
    Math.max(
      measureUiText(tUiSource(title)) + 64,
      labelWidthHint + entryWidthHint + 32,
      actionWidthHint + 32,
      displayMessage
        ? Math.min(
            MESSAGE_PREFERRED_WIDTH,
            Math.max(...displayMessage.split("\n").map((line) => measureUiText(line))) +
              MESSAGE_WIDTH_PADDING,
          )
        : 0,
    );
  const narrow = scene.width > 0 && preferredWidth > scene.width;
  const flow = !content && !headerActions && !tabs && (!layout || narrow);
  const dialogWidth = Math.max(
    1,
    flow && scene.width > 0 ? Math.min(preferredWidth, scene.width) : preferredWidth,
  );
  const lines = useMemo(
    () =>
      displayMessage
        ? wrapMessage(displayMessage, Math.max(1, dialogWidth - MESSAGE_WIDTH_PADDING))
        : [],
    [displayMessage, dialogWidth],
  );
  const tabHeight = tabs ? 44 : 0;
  const messageHeight = (lines.length ? lines.length * 22 + 12 : 0) + tabHeight;
  const rows = [...new Set(fields.map((field) => field.row ?? field.key))];
  const activeColorField = fields.find(
    (field): field is Extract<FormField, { type: "color" }> =>
      field.type === "color" && field.key === colorFieldKey,
  );
  const typing = fields.length === 1 && fields[0]?.type === "text" && !content && !tabs;
  const height =
    flow && flowHeight !== null
      ? FORM_DIALOG_CHROME_HEIGHT + flowHeight
      : ((!flow ? layout?.height : undefined) ??
        FORM_DIALOG_CHROME_HEIGHT + 12 + messageHeight + rows.length * 44 + 52);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() =>
    layout && !flow
      ? {
          x: (Math.floor(scene.width / 4) - Math.floor(dialogWidth / 4)) * 2,
          y: Math.max(
            0,
            (Math.floor(scene.height / 4) - Math.floor(height / 4)) * 2 +
              (layout.originOffsetY ?? 0),
          ),
        }
      : null,
  );
  useEffect(() => {
    if (!open) {
      setPosition(null);
      setColorFieldKey(null);
      setFlowHeight(null);
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = host.current;
    const ownedPopup = (target: EventTarget | null) => isDialogPopupTarget(root, target);
    const first = () => {
      const target =
        (layout?.initialFocusAction
          ? root?.querySelector<HTMLElement>(
              `button[data-ui-form-action="${layout.initialFocusAction}"]:not(:disabled)`,
            )
          : null) ??
        root?.querySelector<HTMLElement>("input:not(:disabled)") ??
        root?.querySelector<HTMLElement>(focusable) ??
        root?.querySelector<HTMLElement>('[role="dialog"]');
      if (target instanceof HTMLInputElement)
        initializeFocus(root, { selectText: selectInitialInput, typing });
      else target?.focus({ preventScroll: true });
    };
    first();
    const focus = (event: FocusEvent) => {
      if (!root?.contains(event.target as Node) && !ownedPopup(event.target))
        focusDialogContainer(root);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (ownedPopup(event.target as Node)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current(false);
      }
      if (
        submitOnEnter &&
        event.key === "Enter" &&
        event.target instanceof HTMLInputElement &&
        event.target.getAttribute("role") !== "combobox"
      ) {
        const action = currentActions.current.find((action) => !action.disabled);
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          action.onClick();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [...(root?.querySelectorAll<HTMLElement>(focusable) ?? [])];
      if (!nodes.length) {
        event.preventDefault();
        focusDialogContainer(root);
        return;
      }
      const current = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        current < 0 ||
        (event.shiftKey && current === 0) ||
        (!event.shiftKey && current === nodes.length - 1)
      ) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [
    open,
    submitOnEnter,
    portalTarget,
    layout?.initialFocusAction,
    selectInitialInput,
    initializeFocus,
    typing,
  ]);
  const bounds = {
    x: position?.x ?? Math.round((scene.width - dialogWidth) / 2),
    y: position?.y ?? Math.max(0, Math.round((scene.height - height) / 2)),
    width: dialogWidth,
    height,
  };
  const dialog = open ? (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {overlay}
      <EditorDialog
        open
        onOpenChange={onOpenChange}
        title={title}
        description={message}
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
        contentLayout={flow ? OverlayContentLayout.Flow : OverlayContentLayout.Positioned}
        titlebarActions={
          helpUrl
            ? ({ bounds: frame }) => (
                <Button
                  bounds={{ x: frame.x + frame.width - 44, y: frame.y + 6, width: 18, height: 22 }}
                  relativeTo={frame}
                  part="window_button_normal"
                  hotPart="window_button_hot"
                  pushedPart="window_button_selected"
                  icon="window_help_icon"
                  insetContent={false}
                  aria-label={tUi("ui.help.for", { value1: title })}
                  onClick={() => window.open(helpUrl, "_blank", "noopener")}
                />
              )
            : undefined
        }
      >
        {({ clientBounds: client }) =>
          flow ? (
            <>
              <FlowForm
                fields={fields}
                message={displayMessage}
                actions={actions}
                layout={layout}
                onHeightChange={setFlowHeight}
                onColorClick={(field, anchor) => {
                  setColorFieldKey(field.key);
                  setColorAnchor(anchor);
                }}
              />
              {activeColorField && (
                <ColorPicker
                  open
                  onOpenChange={(open) => {
                    if (!open) setColorFieldKey(null);
                  }}
                  value={activeColorField.value}
                  onValueChange={activeColorField.onChange}
                  title={activeColorField.label}
                  anchor={colorAnchor}
                />
              )}
            </>
          ) : (
            <>
              {headerActions?.map((action) => (
                <Button
                  variant={ButtonVariant.FlatIcon}
                  key={action.label}
                  bounds={{
                    x: client.x + action.x,
                    y: client.y + action.y,
                    width: action.width,
                    height: action.height,
                  }}
                  relativeTo={client}
                  icon={action.icon}
                  label={action.label}
                  title={action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                />
              ))}
              {tabs?.items.map((tab, index) => (
                <Button
                  key={tab.value}
                  bounds={
                    layout?.tabs
                      ? {
                          x:
                            client.x +
                            layout.tabs.x +
                            layout.tabs.widths.slice(0, index).reduce((n, w) => n + w, 0),
                          y: client.y + layout.tabs.y,
                          width:
                            layout.tabs.widths[index] + (index < tabs.items.length - 1 ? 2 : 0),
                          height: layout.tabs.height,
                        }
                      : {
                          x: client.x + 8 + (index * (client.width - 16)) / tabs.items.length,
                          y: client.y + 8,
                          width: (client.width - 16) / tabs.items.length,
                          height: 32,
                        }
                  }
                  relativeTo={client}
                  text={tab.label}
                  focusAppearance="always"
                  selected={tabs.selectedValues?.includes(tab.value) ?? tabs.value === tab.value}
                  part="buttonset_item_normal"
                  hotPart="buttonset_item_hot"
                  pushedPart="buttonset_item_pushed"
                  selectedPart="buttonset_item_hot"
                  role="tab"
                  aria-selected={
                    tabs.selectedValues?.includes(tab.value) ?? tabs.value === tab.value
                  }
                  onClick={() => tabs.onChange(tab.value)}
                />
              ))}
              {lines.map((line, i) => (
                <Text
                  variant={TextVariant.Control}
                  key={i}
                  bounds={{
                    x: client.x + 8,
                    y: client.y + 8 + tabHeight + i * 22,
                    width: client.width - 16,
                    height: 20,
                  }}
                  relativeTo={client}
                  text={line}
                />
              ))}
              {layout?.separators?.map((separator, index) => (
                <Divider
                  key={`separator-${index}`}
                  bounds={{ ...separator, x: client.x + separator.x, y: client.y + separator.y }}
                  relativeTo={client}
                  text={separator.text}
                  vertical={separator.vertical}
                />
              ))}
              {fields.map((field) => {
                const row = field.row ?? field.key;
                const peers = fields.filter((item) => (item.row ?? item.key) === row);
                const column = peers.indexOf(field);
                const authored = layout?.fields[field.key];
                const inset = authored?.inset ?? 8;
                const columnWidth = authored?.width ?? client.width / peers.length;
                const columnX = client.x + (authored?.x ?? column * columnWidth);
                const y = client.y + (authored?.y ?? 8 + messageHeight + rows.indexOf(row) * 44);
                const labelWidth =
                  authored?.labelWidth ??
                  (peers.length > 1 ? measureUiText(tUiSource(field.label)) + 24 : labelWidthHint);
                const input = {
                  x: columnX + labelWidth,
                  y,
                  width: columnWidth - labelWidth - inset,
                  height: authored?.height ?? 32,
                };
                if (field.type === "label")
                  return (
                    <Text
                      variant={TextVariant.Control}
                      key={field.key}
                      bounds={{
                        x: columnX + (authored ? 2 : 0),
                        y: authored ? y : y + 8,
                        width: columnWidth,
                        height: authored ? (authored.height ?? 32) : 20,
                      }}
                      relativeTo={client}
                      text={field.label}
                    />
                  );
                if (field.type === "button") {
                  if (field.icon) {
                    return (
                      <IconControl
                        key={field.key}
                        bounds={{
                          x: columnX,
                          y,
                          width: columnWidth,
                          height: authored?.height ?? 30,
                        }}
                        relativeTo={client}
                        icon={field.icon}
                        label={field.label}
                        expanded={field.expanded}
                        disabled={field.disabled}
                        onClick={field.onClick}
                      />
                    );
                  }
                  return (
                    <Button
                      key={field.key}
                      bounds={{ x: columnX, y, width: columnWidth, height: authored?.height ?? 30 }}
                      relativeTo={client}
                      text={field.label}
                      font="default"
                      part="button_normal"
                      hotPart="button_hot"
                      onClick={field.onClick}
                      disabled={field.disabled}
                    />
                  );
                }
                if (field.type === "link")
                  return (
                    <WorkspaceLink
                      key={field.key}
                      variant={WorkspaceLinkVariant.Inline}
                      bounds={{ x: columnX, y, width: columnWidth, height: authored?.height ?? 30 }}
                      relativeTo={client}
                      onClick={field.onClick}
                    >
                      {field.label}
                    </WorkspaceLink>
                  );
                if (field.type === "checkbox")
                  return (
                    <Checkbox
                      key={field.key}
                      bounds={{
                        x: columnX + inset,
                        y,
                        width: columnWidth - inset * 2,
                        height: authored?.height ?? 32,
                      }}
                      relativeTo={client}
                      label={field.label}
                      checked={field.value}
                      disabled={field.disabled}
                      onCheckedChange={field.onChange}
                    />
                  );
                if (field.type === "color")
                  return (
                    <span key={field.key}>
                      <Text
                        variant={TextVariant.Control}
                        bounds={{
                          x: columnX + inset + (authored ? 2 : 0),
                          y: authored ? y : y + 8,
                          width: labelWidth - inset - (authored ? 2 : 0),
                          height: authored ? (authored.height ?? 32) : 20,
                        }}
                        relativeTo={client}
                        text={field.label}
                      />
                      <EditorColorButton
                        bounds={input}
                        relativeTo={client}
                        value={field.value}
                        aria-label={field.label || field.key}
                        disabled={field.disabled}
                        onClick={() => {
                          setColorFieldKey(field.key);
                          setColorAnchor(input);
                        }}
                      />
                    </span>
                  );
                return (
                  <span key={field.key}>
                    <Text
                      variant={TextVariant.Control}
                      bounds={{
                        x: columnX + inset + (authored ? 2 : 0),
                        y: authored ? y : y + 8,
                        width: labelWidth - inset - (authored ? 2 : 0),
                        height: authored ? (authored.height ?? 32) : 20,
                      }}
                      relativeTo={client}
                      text={field.label}
                    />
                    {field.type === "select" ? (
                      <Combobox
                        bounds={input}
                        relativeTo={client}
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
                        bounds={
                          field.type === "filename" ? { ...input, width: input.width - 28 } : input
                        }
                        relativeTo={client}
                        aria-label={field.label || field.key}
                        disabled={field.disabled}
                        value={String(field.value)}
                        inputMode={field.type === "number" ? "decimal" : "text"}
                        onValueChange={field.type === "text" ? field.onChange : undefined}
                        onCommit={(value) => {
                          if (field.type === "text" || field.type === "filename")
                            field.onChange(value);
                          else {
                            const number = Number(value);
                            if (value.trim() && Number.isFinite(number))
                              field.onChange(
                                Math.max(
                                  field.min ?? -Infinity,
                                  Math.min(
                                    field.max ?? Infinity,
                                    field.step
                                      ? Math.round((number - (field.min ?? 0)) / field.step) *
                                          field.step +
                                          (field.min ?? 0)
                                      : number,
                                  ),
                                ),
                              );
                          }
                        }}
                      />
                    )}
                    {field.type === "filename" && (
                      <Button
                        bounds={{
                          x: input.x + input.width - 28,
                          y: input.y,
                          width: 28,
                          height: input.height,
                        }}
                        relativeTo={client}
                        text="..."
                        font="default"
                        part="buttonset_item_normal"
                        hotPart="buttonset_item_hot"
                        pushedPart="buttonset_item_pushed"
                        aria-label={tUi("ui.choose.2", {
                          value1: tUiSource(field.label || "output file"),
                        })}
                        disabled={field.disabled || !field.onBrowse}
                        onClick={field.onBrowse}
                      />
                    )}
                  </span>
                );
              })}
              {content?.(client)}
              {activeColorField && (
                <ColorPicker
                  open
                  onOpenChange={(open) => {
                    if (!open) setColorFieldKey(null);
                  }}
                  value={activeColorField.value}
                  onValueChange={activeColorField.onChange}
                  title={activeColorField.label}
                  anchor={colorAnchor}
                />
              )}
              {actions.map((action, i) => {
                const widths = actions.map((item) => measureUiText(tUiSource(item.label)) + 32);
                const remaining = widths.slice(i).reduce((total, item) => total + item + 8, 0);
                return (
                  <Button
                    key={`${action.label}-${i}`}
                    bounds={
                      layout?.actions?.[action.label]
                        ? {
                            ...layout.actions[action.label],
                            x: client.x + layout.actions[action.label].x,
                            y: client.y + layout.actions[action.label].y,
                          }
                        : {
                            x: client.x + client.width - remaining,
                            y: client.y + 8 + messageHeight + rows.length * 44,
                            width: widths[i],
                            height: 32,
                          }
                    }
                    relativeTo={client}
                    text={action.label}
                    data-ui-form-action={action.label}
                    focusAppearance={
                      layout?.initialFocusAction === action.label ? "always" : undefined
                    }
                    font={layout ? "default" : undefined}
                    part={layout ? "button_normal" : undefined}
                    hotPart={layout ? "button_hot" : undefined}
                    focusedPart={layout ? "button_focused" : undefined}
                    pushedPart={layout ? "button_selected" : undefined}
                    mnemonicIndex={layout && action.label !== "Select File" ? 0 : undefined}
                    disabled={action.disabled}
                    disabledTextShadow={!!layout}
                    onClick={action.onClick}
                  />
                );
              })}
            </>
          )
        }
      </EditorDialog>
    </div>
  ) : null;
  return (
    <>
      <span ref={portalMarker} aria-hidden="true" style={{ display: "none" }} />
      {dialog && portalTarget ? createPortal(dialog, portalTarget) : null}
    </>
  );
}
