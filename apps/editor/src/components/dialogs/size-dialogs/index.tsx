import { useEffect, useRef, useState, type ReactNode } from "react";

import { CanvasSizeOverlay } from "$/components/canvas/canvas-size-overlay";
import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { tUi, tUiSource } from "$/i18n";
import {
  DIALOG_IMAGE_DIMENSION_MAX,
  DialogCanvasAnchor,
  DialogSpriteResizeMethod,
  evaluateDialogNumber,
  validDialogImageSize,
  useDialogInputPreferences,
  type DialogCanvasAnchor as DialogCanvasAnchorType,
  type DialogRect,
  type DialogSpriteResizeMethod as DialogSpriteResizeMethodType,
  type DialogViewTransform,
} from "$/managers/dialogs/input-values";
import {
  Button,
  Checkbox,
  Combobox,
  Divider,
  Input,
  Label,
  focusDialogContainer,
  isDialogPopupTarget,
  type SurfaceBounds,
} from "@xprite/ui";
import { centerUiPixel } from "@xprite/ui/assets";
import type { UiPartName } from "@xprite/ui/assets";
import { isImeKeyboardEvent, stylusPointerInputProps } from "@xprite/ui/utils";

import "$/components/dialogs/size-dialogs/size-dialogs.module.css";
export interface DocumentSizeDialogsProps {
  kind: "sprite" | "canvas" | null;
  suspended?: boolean;
  allowTrimOutside?: boolean;
  documentWidth: number;
  documentHeight: number;
  onClose: () => void;
  onSpriteSize: (
    width: number,
    height: number,
    method: DialogSpriteResizeMethodType,
  ) => void | boolean;
  onCanvasSize: (bounds: DialogRect, trimOutside: boolean) => void | boolean;
  /** Position Canvas Size beside the active editor's top-right corner. */
  editorBounds?: SurfaceBounds;
  canvasViewportBounds?: SurfaceBounds;
  view?: DialogViewTransform;
  /** Preview adapter owns document-space rulers; accepting commits once. */
  onCanvasPreview?: (bounds: DialogRect | null) => void;
}
const clampSize = (n: number) => Math.max(1, Math.min(DIALOG_IMAGE_DIMENSION_MAX, Math.trunc(n)));
const valid = validDialogImageSize;
const numeric = evaluateDialogNumber;
const percentage = (n: number) => Number(n.toPrecision(4)).toString();
const names = [
  "Top Left",
  "Top",
  "Top Right",
  "Left",
  "Center",
  "Right",
  "Bottom Left",
  "Bottom",
  "Bottom Right",
];
/** Purpose-built source dialogs: every bound is relative to XML's remapped
 * client region. Apps/gallery supply domain actions and no layout or paint. */
export function DocumentSizeDialogs(props: DocumentSizeDialogsProps) {
  return props.kind ? (
    <SizeDialog
      key={`${props.kind}-${props.documentWidth}-${props.documentHeight}`}
      {...props}
      kind={props.kind}
    />
  ) : null;
}
function SizeDialog({
  kind,
  documentWidth: ow,
  documentHeight: oh,
  onClose,
  onSpriteSize,
  onCanvasSize,
  editorBounds,
  onCanvasPreview,
  canvasViewportBounds,
  view,
  suspended = false,
  allowTrimOutside = true,
}: DocumentSizeDialogsProps & {
  kind: "sprite" | "canvas";
}) {
  const [values, setValues] = useState({
    width: String(ow),
    height: String(oh),
    widthPercent: "100",
    heightPercent: "100",
    left: "0",
    right: "0",
    top: "0",
    bottom: "0",
  });
  const inputPreferences = useDialogInputPreferences();
  const [preferences] = useState(inputPreferences.readDocumentSizePreferences);
  const [lockRatio, setLockRatio] = useState(preferences.lockRatio),
    [method, setMethod] = useState<DialogSpriteResizeMethodType>(preferences.method),
    [anchor, setAnchor] = useState<DialogCanvasAnchorType>(DialogCanvasAnchor.Center),
    [trim, setTrim] = useState(allowTrimOutside && preferences.trim);
  useEffect(() => {
    if (kind !== "canvas" || suspended || !allowTrimOutside) return;
    const mnemonic = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        event.stopPropagation();
        setTrim((value) => !value);
      }
    };
    document.addEventListener("keydown", mnemonic, true);
    return () => document.removeEventListener("keydown", mnemonic, true);
  }, [kind, suspended, allowTrimOutside]);
  const width = numeric(values.width),
    height = numeric(values.height);
  const allValid =
    width !== null &&
    height !== null &&
    valid(width, height) &&
    (["left", "right", "top", "bottom"] as const).every((k) => numeric(values[k]) !== null);
  const borders = (w: number, h: number, a = anchor) => {
    const dx = Math.trunc(w) - ow,
      dy = Math.trunc(h) - oh,
      col = a % 3,
      row = Math.floor(a / 3),
      left = col === 0 ? 0 : col === 2 ? dx : Math.trunc(dx / 2),
      top = row === 0 ? 0 : row === 2 ? dy : dy - Math.trunc(dy / 2);
    return {
      left: String(left),
      right: String(dx - left),
      top: String(top),
      bottom: String(dy - top),
    };
  };
  const resize = (
    key: "width" | "height" | "widthPercent" | "heightPercent",
    text: string,
    forceLock = lockRatio,
  ) => {
    const n = numeric(text);
    setValues((old) => {
      const next = { ...old, [key]: text };
      if (n === null) return next;
      if (kind === "canvas")
        return {
          ...next,
          ...borders(
            key === "width" ? n : (numeric(old.width) ?? ow),
            key === "height" ? n : (numeric(old.height) ?? oh),
          ),
        };
      const horizontal = key.startsWith("width"),
        base = horizontal ? ow : oh,
        pixels = key.endsWith("Percent") ? Math.trunc((base * n) / 100) : Math.trunc(n),
        percent = key.endsWith("Percent") ? text : percentage((100 * pixels) / base);
      if (horizontal) {
        next.width = key === "width" ? text : String(pixels);
        next.widthPercent = percent;
        if (forceLock) {
          next.height = String(
            Math.trunc(key.endsWith("Percent") ? (oh * n) / 100 : (oh * pixels) / ow),
          );
          next.heightPercent = percent;
        }
      } else {
        next.height = key === "height" ? text : String(pixels);
        next.heightPercent = percent;
        if (forceLock) {
          next.width = String(
            Math.trunc(key.endsWith("Percent") ? (ow * n) / 100 : (ow * pixels) / oh),
          );
          next.widthPercent = percent;
        }
      }
      return next;
    });
  };
  const changeBorder = (key: "left" | "right" | "top" | "bottom", text: string) =>
    setValues((old) => {
      const next = { ...old, [key]: text };
      if (numeric(text) !== null) {
        next.width = String(
          ow + Math.trunc(numeric(next.left) ?? 0) + Math.trunc(numeric(next.right) ?? 0),
        );
        next.height = String(
          oh + Math.trunc(numeric(next.top) ?? 0) + Math.trunc(numeric(next.bottom) ?? 0),
        );
      }
      return next;
    });
  const previewRef = useRef(onCanvasPreview);
  previewRef.current = onCanvasPreview;
  useEffect(() => {
    if (kind === "canvas" && allValid)
      previewRef.current?.({
        x: -(numeric(values.left) ?? 0),
        y: -(numeric(values.top) ?? 0),
        width: clampSize(numeric(values.width) ?? 0),
        height: clampSize(numeric(values.height) ?? 0),
      });
  }, [kind, allValid, values.left, values.top, values.width, values.height]);
  useEffect(() => () => previewRef.current?.(null), []);
  const accept = () => {
    if (!allValid || suspended) return;
    inputPreferences.writeDocumentSizePreferences({ lockRatio, method, trim });
    const accepted =
      kind === "sprite"
        ? onSpriteSize(clampSize(width!), clampSize(height!), method)
        : onCanvasSize(
            {
              x: -Math.trunc(numeric(values.left) ?? 0),
              y: -Math.trunc(numeric(values.top) ?? 0),
              width: clampSize(width!),
              height: clampSize(height!),
            },
            trim,
          );
    if (accepted !== false) onClose();
  };
  const field = (
    client: SurfaceBounds,
    key: keyof typeof values,
    label: string,
    x: number,
    y: number,
    w: number,
    suffix = "px",
  ) => (
    <Input
      key={key}
      aria-label={label}
      bounds={{ x: client.x + x, y: client.y + y, width: w, height: 30 }}
      relativeTo={client}
      value={values[key]}
      suffix={suffix}
      inputMode="text"
      onCommit={(text) => {
        const n = numeric(text);
        if (n !== null)
          setValues((old) => ({
            ...old,
            [key]: key.endsWith("Percent") ? n.toFixed(4) : String(Math.trunc(n)),
          }));
      }}
      onValueChange={(text) =>
        key === "left" || key === "right" || key === "top" || key === "bottom"
          ? changeBorder(key, text)
          : resize(key, text)
      }
    />
  );
  const label = (client: SurfaceBounds, text: string, x: number, y: number, w: number, h = 30) => (
    <Label
      text={text}
      bounds={{ x: client.x + x + 2, y: client.y + y, width: Math.max(0, w - 2), height: h }}
      relativeTo={client}
    />
  );
  const canvasBounds = {
    x: -Math.trunc(numeric(values.left) ?? 0),
    y: -Math.trunc(numeric(values.top) ?? 0),
    width: Math.max(0, Math.trunc(width ?? ow)),
    height: Math.max(0, Math.trunc(height ?? oh)),
  };
  const rulerOverlay = kind === "canvas" && canvasViewportBounds && view;
  return (
    <SizeDialogShell
      suspended={suspended}
      overlay={
        rulerOverlay && (
          <CanvasSizeOverlay
            viewportBounds={canvasViewportBounds}
            documentWidth={ow}
            documentHeight={oh}
            view={view}
            bounds={canvasBounds}
            onBoundsChange={(b) =>
              setValues((old) => ({
                ...old,
                width: String(b.width),
                height: String(b.height),
                left: String(-b.x),
                top: String(-b.y),
                right: String(b.x + b.width - ow),
                bottom: String(b.y + b.height - oh),
              }))
            }
          />
        )
      }
      title={kind === "sprite" ? "Sprite Size" : "Canvas Size"}
      width={kind === "sprite" ? 332 : 382}
      height={kind === "sprite" ? 362 : 396}
      onClose={onClose}
      onAccept={accept}
      preferredOrigin={
        kind === "canvas" && editorBounds
          ? { x: editorBounds.x + editorBounds.width - 382, y: editorBounds.y }
          : undefined
      }
    >
      {(client) => (
        <>
          <SizeSection client={client} y={0} text={kind === "sprite" ? "Pixels:" : "Size:"} />
          {label(client, "Width:", 0, 30, 58)}
          {field(client, "width", "Width", 66, 30, 110)}
          {label(client, "Height:", 0, 68, 58)}
          {field(client, "height", "Height", 66, 68, 110)}
          {kind === "sprite" ? (
            <>
              <Checkbox
                label="Lock Ratio"
                checked={lockRatio}
                onCheckedChange={(value) => {
                  setLockRatio(value);
                  resize("width", values.width, value);
                }}
                bounds={{ x: client.x + 184, y: client.y + 30, width: 124, height: 68 }}
                relativeTo={client}
              />
              <SizeSection client={client} y={106} text="Percentage:" />
              {label(client, "Width:", 0, 136, 58)}
              {field(client, "widthPercent", "Width Percentage", 66, 136, 100, "%")}
              {label(client, "Height:", 0, 174, 58)}
              {field(client, "heightPercent", "Height Percentage", 66, 174, 100, "%")}
              <SizeSection client={client} y={212} text="Interpolation:" />
              {label(client, "Method:", 0, 242, 66, 32)}
              <Combobox
                aria-label="Method"
                bounds={{ x: client.x + 74, y: client.y + 242, width: 234, height: 32 }}
                relativeTo={client}
                value={method}
                onValueChange={(value) => setMethod(value as DialogSpriteResizeMethodType)}
                options={[
                  { value: DialogSpriteResizeMethod.Nearest, label: "Nearest-neighbor" },
                  { value: DialogSpriteResizeMethod.Bilinear, label: "Bilinear" },
                  { value: DialogSpriteResizeMethod.RotSprite, label: "RotSprite" },
                ]}
              />
            </>
          ) : (
            <>
              {names.map((name, index) => {
                const dx = (index % 3) - (anchor % 3),
                  dy = Math.floor(index / 3) - Math.floor(anchor / 3);
                const icon = (
                  dx === 0 && dy === 0
                    ? "canvas_c"
                    : Math.abs(dx) > 1 || Math.abs(dy) > 1
                      ? "canvas_empty"
                      : `canvas_${dy < 0 ? "n" : dy > 0 ? "s" : ""}${dx < 0 ? "w" : dx > 0 ? "e" : ""}`
                ) as UiPartName;
                const selectAnchor = () => {
                  setAnchor(index as DialogCanvasAnchorType);
                  if (width !== null && height !== null)
                    setValues((old) => ({
                      ...old,
                      ...borders(width, height, index as DialogCanvasAnchorType),
                    }));
                };
                return (
                  <Button
                    {...stylusPointerInputProps()}
                    onPointerDown={(event) => {
                      if (event.button === 0) selectAnchor();
                    }}
                    onPointerEnter={(event) => {
                      if (event.buttons & 1) selectAnchor();
                    }}
                    key={name}
                    aria-label={tUi("ui.anchor", { value1: tUiSource(name) })}
                    aria-pressed={anchor === index}
                    selected={anchor === index}
                    icon={icon}
                    part="buttonset_item_normal"
                    hotPart="buttonset_item_hot"
                    pushedPart="buttonset_item_pushed"
                    selectedPart="buttonset_item_hot"
                    bounds={{
                      x: client.x + 184 + (index % 3) * 34,
                      y: client.y + 30 + Math.floor(index / 3) * 34,
                      width: 36,
                      height: 40,
                    }}
                    relativeTo={client}
                    onClick={(event) => {
                      if (event.detail === 0) selectAnchor();
                    }}
                  />
                );
              })}
              <SizeSection client={client} y={146} text="Borders:" />
              {label(client, "Left:", 0, 176, 48)}
              {field(client, "left", "Left", 56, 176, 110)}
              {label(client, "Top:", 174, 176, 66)}
              {field(client, "top", "Top", 248, 176, 110)}
              {label(client, "Right:", 0, 214, 48)}
              {field(client, "right", "Right", 56, 214, 110)}
              {label(client, "Bottom:", 174, 214, 66)}
              {field(client, "bottom", "Bottom", 248, 214, 110)}
              <SizeSection client={client} y={252} />
              <Checkbox
                label="Trim content outside the canvas"
                mnemonicIndex={0}
                disabled={!allowTrimOutside}
                checked={trim}
                onCheckedChange={setTrim}
                bounds={{ x: client.x, y: client.y + 268, width: 358, height: 24 }}
                relativeTo={client}
              />
              <SizeSection client={client} y={300} />
            </>
          )}
          <Button
            text="OK"
            font="default"
            mnemonicIndex={0}
            disabled={!allValid}
            bounds={{
              x: client.x + client.width - 248,
              y: client.y + (kind === "sprite" ? 282 : 316),
              width: 120,
              height: 34,
            }}
            relativeTo={client}
            part="button_normal"
            hotPart="button_hot"
            focusedPart="button_focused"
            pushedPart="button_selected"
            onClick={accept}
          />
          <Button
            text="Cancel"
            font="default"
            mnemonicIndex={0}
            bounds={{
              x: client.x + client.width - 120,
              y: client.y + (kind === "sprite" ? 282 : 316),
              width: 120,
              height: 34,
            }}
            relativeTo={client}
            part="button_normal"
            hotPart="button_hot"
            focusedPart="button_focused"
            pushedPart="button_selected"
            onClick={onClose}
          />
        </>
      )}
    </SizeDialogShell>
  );
}
function SizeSection({
  client,
  y,
  text = "",
}: {
  client: SurfaceBounds;
  y: number;
  text?: string;
}) {
  const bounds = { x: client.x, y: client.y + y, width: client.width, height: text ? 22 : 8 };
  return <Divider bounds={bounds} relativeTo={client} text={text} />;
}
export function SizeDialogShell({
  title,
  width,
  height,
  onClose,
  onAccept,
  preferredOrigin,
  children,
  overlay,
  suspended,
  help = true,
}: {
  overlay?: ReactNode;
  help?: boolean;
  suspended?: boolean;
  allowTrimOutside?: boolean;
  title: string;
  width: number;
  height: number;
  onClose: () => void;
  onAccept: () => void;
  preferredOrigin?: {
    x: number;
    y: number;
  };
  children: (client: SurfaceBounds) => ReactNode;
}) {
  const initializeFocus = useEditorDialogInitialFocus();
  const scene = useSceneBounds(),
    host = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState<{
      x: number;
      y: number;
    } | null>(null),
    callbacks = useRef({ onClose, onAccept });
  callbacks.current = { onClose, onAccept };
  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null,
      root = host.current;
    const first = () => {
      initializeFocus(root, { selectText: true });
    };
    first();
    const owned = (target: EventTarget | null) => isDialogPopupTarget(root, target);
    const focus = (e: FocusEvent) => {
      if (!root?.contains(e.target as Node) && !owned(e.target)) focusDialogContainer(root);
    };
    const key = (e: KeyboardEvent) => {
      if (isImeKeyboardEvent(e)) return;
      if (owned(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        callbacks.current.onClose();
      }
      if (
        e.key === "Enter" &&
        e.target instanceof HTMLInputElement &&
        e.target.getAttribute("role") !== "combobox"
      ) {
        e.preventDefault();
        e.stopPropagation();
        callbacks.current.onAccept();
      }
      if (e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        callbacks.current.onAccept();
      }
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        callbacks.current.onClose();
      }
      if (e.key === "Tab") {
        const nodes = [
            ...(root?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
            ) ?? []),
          ],
          i = nodes.indexOf(document.activeElement as HTMLElement);
        if (
          nodes.length &&
          (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === nodes.length - 1))
        ) {
          e.preventDefault();
          nodes[e.shiftKey ? nodes.length - 1 : 0].focus();
        }
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [suspended, initializeFocus]);
  const bounds = {
    x: position?.x ?? preferredOrigin?.x ?? centerUiPixel(scene.x, scene.width, width),
    y: position?.y ?? preferredOrigin?.y ?? centerUiPixel(scene.y, scene.height, height),
    width,
    height,
  };
  return (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {overlay}
      <EditorDialog
        className="xse-size-dialog"
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={title}
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
        titlebarActions={
          help
            ? ({ bounds: b }) => (
                <Button
                  aria-label={tUi("ui.help.2", { value1: tUiSource(title) })}
                  bounds={{ x: b.x + b.width - 44, y: b.y + 6, width: 18, height: 22 }}
                  relativeTo={b}
                  part="window_button_normal"
                  hotPart="window_button_hot"
                  pushedPart="window_button_selected"
                  icon="window_help_icon"
                  insetContent={false}
                  disabled
                />
              )
            : undefined
        }
      >
        {({ clientBounds }) => children(clientBounds)}
      </EditorDialog>
    </div>
  );
}
