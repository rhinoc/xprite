import { useEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { PixelArtIcon } from "$/components/shared/pixel-art-icon";
import { tUi } from "$/i18n";
import { SaveTarget } from "$/managers/workspace/save-target";
import {
  Button,
  Combobox,
  Divider,
  Input,
  Label,
  focusDialogContainer,
  isDialogPopupTarget,
} from "@xprite/ui";
import { centerUiPixel, measureUiText, useUiAssets } from "@xprite/ui/assets";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/dialogs/save-as/save-as.module.css";

export type SaveAsFormat = "aseprite" | "png";

const SAVE_AS_DIALOG_WIDTH = 360;
const SAVE_AS_DIALOG_MIN_WIDTH = 280;
const SAVE_AS_DIALOG_HEIGHT = 320;
const SAVE_AS_TARGETS = [
  { target: SaveTarget.Browser, message: "ui.save.target.browser", icon: "tab" },
  { target: SaveTarget.FileSystem, message: "ui.save.target.file.manager", icon: "folder" },
] as const;
const SAVE_AS_FILE_NAME_LABEL = "File name";
const SAVE_AS_TARGET_Y = 132;
const SAVE_AS_TARGET_HEIGHT = 80;
const SAVE_AS_TARGET_TEXT_OFFSET_Y = -24;
const SAVE_AS_FILE_NAME_GAP = 8;
const SAVE_AS_BUTTON_Y = 240;
const SAVE_AS_BUTTON_WIDTH = 120;
const SAVE_AS_BUTTON_HEIGHT = 34;
const SAVE_AS_BUTTON_GAP = 8;

export interface SaveAsDialogProps {
  open: boolean;
  documentName: string;
  defaultFormat?: SaveAsFormat;
  saveTarget: SaveTarget;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, format: SaveAsFormat, target: SaveTarget) => void;
}

function formatFromName(name: string): SaveAsFormat {
  return /\.(?:ase|aseprite)$/i.test(name) ? "aseprite" : "png";
}

function normalizedName(name: string, format: SaveAsFormat): string {
  const extension = format === "aseprite" ? ".aseprite" : ".png";
  const trimmed = name.trim() || "Untitled";
  const stem = trimmed.replace(/\.[^.]+$/, "").trim() || "Untitled";
  return `${stem}${extension}`;
}

export function SaveAsDialog({
  open,
  documentName,
  defaultFormat,
  saveTarget: initialSaveTarget,
  busy = false,
  onOpenChange,
  onSave,
}: SaveAsDialogProps) {
  const initializeFocus = useEditorDialogInitialFocus();
  const sceneBounds = useSceneBounds();
  const host = useRef<HTMLDivElement>(null);
  const latestOpenChange = useRef(onOpenChange);
  latestOpenChange.current = onOpenChange;
  const wasOpen = useRef(false);
  const browserTargetRef = useRef<HTMLButtonElement>(null);
  const fileManagerTargetRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [name, setName] = useState(() =>
    normalizedName(documentName, defaultFormat ?? formatFromName(documentName)),
  );
  const [format, setFormat] = useState<SaveAsFormat>(
    () => defaultFormat ?? formatFromName(documentName),
  );
  const [saveTarget, setSaveTarget] = useState(initialSaveTarget);
  const latestSaveState = useRef({ onSave, busy, name, format, saveTarget });
  latestSaveState.current = { onSave, busy, name, format, saveTarget };
  const assets = useUiAssets();
  const optionTextColor = assets?.style.colors.button_hot_text ?? "currentColor";
  const dialogWidth = Math.min(
    SAVE_AS_DIALOG_WIDTH,
    Math.max(SAVE_AS_DIALOG_MIN_WIDTH, sceneBounds.width),
  );

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      setPosition(null);
      return;
    }
    if (!wasOpen.current) {
      const initialFormat = defaultFormat ?? formatFromName(documentName);
      setName(normalizedName(documentName, initialFormat));
      setFormat(initialFormat);
      setSaveTarget(initialSaveTarget);
    }
    wasOpen.current = true;
  }, [open, documentName, defaultFormat, initialSaveTarget]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusName = () => {
      initializeFocus(host.current, {
        selector: `input[data-label-source="${SAVE_AS_FILE_NAME_LABEL}"]`,
        selectText: true,
      });
    };
    focusName();
    const focus = (event: FocusEvent) => {
      if (
        !host.current?.contains(event.target as Node) &&
        !isDialogPopupTarget(host.current, event.target)
      )
        focusDialogContainer(host.current);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (isDialogPopupTarget(host.current, event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!latestSaveState.current.busy) latestOpenChange.current(false);
        return;
      }
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        const latest = latestSaveState.current;
        if (!latest.busy && latest.name.trim())
          latest.onSave(
            normalizedName(latest.name, latest.format),
            latest.format,
            latest.saveTarget,
          );
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(host.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        nodes.length &&
        (index < 0 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === nodes.length - 1))
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
  }, [open, dialogWidth, initializeFocus]);

  if (!open) return null;
  const bounds = {
    x: position?.x ?? centerUiPixel(sceneBounds.x, sceneBounds.width, dialogWidth),
    y: position?.y ?? centerUiPixel(sceneBounds.y, sceneBounds.height, SAVE_AS_DIALOG_HEIGHT),
    width: dialogWidth,
    height: SAVE_AS_DIALOG_HEIGHT,
  };
  const save = () => {
    if (busy || !name.trim()) return;
    onSave(normalizedName(name, format), format, saveTarget);
  };
  const close = () => {
    if (!busy) onOpenChange(false);
  };
  const formatOptions = [
    { label: tUi("ui.save.format.aseprite"), value: "aseprite" },
    { label: tUi("ui.save.format.png"), value: "png" },
  ];

  return (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <EditorDialog
        open
        onOpenChange={(nextOpen) => {
          if (nextOpen || !busy) onOpenChange(nextOpen);
        }}
        title={tUi("ui.save.as")}
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
      >
        {({ clientBounds: client }) => {
          const fileNameLabel = tUi("ui.file.name.da5ac4f8");
          const fileNameLabelWidth = measureUiText(fileNameLabel);
          const fileNameInputX = 2 + fileNameLabelWidth + SAVE_AS_FILE_NAME_GAP;
          const firstTargetWidth = Math.round(client.width / SAVE_AS_TARGETS.length);
          const buttonSet = SAVE_AS_TARGETS.map((item, index) => ({
            ...item,
            label: tUi(item.message),
            selected: saveTarget === item.target,
            x: index === 0 ? 0 : firstTargetWidth,
            width: index === 0 ? firstTargetWidth + 2 : client.width - firstTargetWidth,
            ref: item.target === SaveTarget.Browser ? browserTargetRef : fileManagerTargetRef,
          }));
          return (
            <>
              <Label
                text={fileNameLabel}
                bounds={{
                  x: client.x + 2,
                  y: client.y + 8,
                  width: fileNameLabelWidth,
                  height: 14,
                }}
                relativeTo={client}
              />
              <Input
                aria-label={SAVE_AS_FILE_NAME_LABEL}
                aria-invalid={!name.trim() || undefined}
                value={name}
                disabled={busy}
                onValueChange={setName}
                bounds={{
                  x: client.x + fileNameInputX,
                  y: client.y,
                  width: client.width - fileNameInputX,
                  height: 30,
                }}
                relativeTo={client}
              />
              <Divider
                text={`${tUi("ui.save.format")}:`}
                bounds={{ x: client.x, y: client.y + 42, width: client.width, height: 22 }}
                relativeTo={client}
              />
              <Combobox
                aria-label={tUi("ui.save.format")}
                value={format}
                options={formatOptions}
                disabled={busy}
                onValueChange={(value) => {
                  const nextFormat = value as SaveAsFormat;
                  setFormat(nextFormat);
                  setName((previous) => normalizedName(previous, nextFormat));
                }}
                bounds={{ x: client.x, y: client.y + 68, width: client.width, height: 30 }}
                relativeTo={client}
              />
              <Divider
                text={`${tUi("ui.save.destination")}:`}
                bounds={{ x: client.x, y: client.y + 108, width: client.width, height: 22 }}
                relativeTo={client}
              />
              <div role="group" aria-label={tUi("ui.save.destination")}>
                {buttonSet.map((item) => (
                  <Button
                    key={item.target}
                    buttonRef={item.ref}
                    aria-label={item.label}
                    aria-pressed={item.selected}
                    selected={item.selected}
                    text={item.label}
                    font="mini"
                    textOffset={{ x: 0, y: SAVE_AS_TARGET_TEXT_OFFSET_Y }}
                    color={optionTextColor}
                    style={{ color: optionTextColor }}
                    part="buttonset_item_normal"
                    hotPart="buttonset_item_hot"
                    bounds={{
                      x: client.x + item.x,
                      y: client.y + SAVE_AS_TARGET_Y,
                      width: item.width,
                      height: SAVE_AS_TARGET_HEIGHT,
                    }}
                    relativeTo={client}
                    className={styles.targetOption}
                    onClick={() => setSaveTarget(item.target)}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      const nextTarget =
                        item.target === SaveTarget.Browser
                          ? SaveTarget.FileSystem
                          : SaveTarget.Browser;
                      setSaveTarget(nextTarget);
                      (nextTarget === SaveTarget.Browser
                        ? browserTargetRef
                        : fileManagerTargetRef
                      ).current?.focus();
                    }}
                    disabled={busy}
                    tabIndex={item.selected ? 0 : -1}
                  >
                    <span className={styles.targetOptionIcon}>
                      <PixelArtIcon name={item.icon} />
                    </span>
                  </Button>
                ))}
              </div>
              <Button
                text={tUi("ui.save")}
                mnemonicIndex={0}
                font="default"
                part="button_normal"
                hotPart="button_hot"
                focusedPart="button_focused"
                pushedPart="button_selected"
                disabled={busy || !name.trim()}
                bounds={{
                  x: client.x + client.width - SAVE_AS_BUTTON_WIDTH * 2 - SAVE_AS_BUTTON_GAP,
                  y: client.y + SAVE_AS_BUTTON_Y,
                  width: SAVE_AS_BUTTON_WIDTH,
                  height: SAVE_AS_BUTTON_HEIGHT,
                }}
                relativeTo={client}
                onClick={save}
              />
              <Button
                text={tUi("ui.cancel")}
                mnemonicIndex={0}
                font="default"
                part="button_normal"
                hotPart="button_hot"
                focusedPart="button_focused"
                pushedPart="button_selected"
                disabled={busy}
                bounds={{
                  x: client.x + client.width - SAVE_AS_BUTTON_WIDTH,
                  y: client.y + SAVE_AS_BUTTON_Y,
                  width: SAVE_AS_BUTTON_WIDTH,
                  height: SAVE_AS_BUTTON_HEIGHT,
                }}
                relativeTo={client}
                onClick={close}
              />
            </>
          );
        }}
      </EditorDialog>
    </div>
  );
}
