import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { tUi, tUiSource } from "$/i18n";
import { useTilemapDialogModel } from "$/managers/tools/tilemap-dialog-model";
import { useAdvancedTilesetOptions } from "$/managers/tools/tilemap-dialog-preferences";
import {
  TOOL_CONTROL_CHANNEL_MAX as UINT8_MAX,
  MAX_TILEMAP_BASE_INDEX as INT16_MAX,
  MIN_TILEMAP_BASE_INDEX as INT16_MIN,
} from "$/managers/tools/tool-options";
import { Button, Input, Label, isDialogPopupTarget } from "@xprite/ui";
import { Combobox } from "@xprite/ui";
import { Checkbox } from "@xprite/ui";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

export function TilemapDialog({
  convert: requestedConvert,
  properties = false,
  onClose,
}: {
  convert: boolean;
  properties?: boolean;
  onClose: () => void;
}) {
  const initializeFocus = useEditorDialogInitialFocus();
  const host = useRef<HTMLDivElement>(null);
  const convert = requestedConvert || properties;
  const scene = useSceneBounds();
  const editor = useTilemapDialogModel();
  const sceneRoot =
    typeof document === "undefined"
      ? null
      : (document.querySelector<HTMLElement>(".xse-editor-window[data-ui-scene='true']") ??
        document.body);
  const tilesets = editor.tilesets;
  const initialSet = editor.activeTileset;
  const [name, setName] = useState(() => `Tilemap ${editor.tilemapLayerCount + 1}`);
  const [error, setError] = useState("");
  const [tilesetName, setTilesetName] = useState(properties ? (initialSet?.name ?? "") : "");
  const [source, setSource] = useState(properties ? String(initialSet?.id ?? "new") : "new");
  const [width, setWidth] = useState(String(editor.defaultTileWidth));
  const [height, setHeight] = useState(String(editor.defaultTileHeight));
  const [advanced, setAdvanced] = useAdvancedTilesetOptions();
  const [baseIndex, setBaseIndex] = useState(String(properties ? (initialSet?.baseIndex ?? 1) : 1));
  const [matchFlags, setMatchFlags] = useState(properties ? (initialSet?.flags ?? 0) & 0x38 : 0);
  const chosen = tilesets.find((set) => String(set.id) === source);
  const tileWidth = chosen?.tileWidth ?? Number(width),
    tileHeight = chosen?.tileHeight ?? Number(height);
  const index = Number(baseIndex);
  const valid =
    Number.isInteger(tileWidth) &&
    Number.isInteger(tileHeight) &&
    tileWidth > 0 &&
    tileHeight > 0 &&
    tileWidth <= 4096 &&
    tileHeight <= 4096 &&
    Number.isInteger(index) &&
    index >= INT16_MIN &&
    index <= INT16_MAX;
  const accept = () => {
    if (!valid) return;
    try {
      const options = {
        tileWidth,
        tileHeight,
        tilesetName: tilesetName.trim(),
        baseIndex: index,
        matchFlags,
      };
      if (properties) {
        if (!chosen) throw new Error("Missing Tileset");
        editor.setActiveTilesetProperties(chosen.id, {
          name: tilesetName,
          baseIndex: index,
          matchFlags,
        });
      } else if (requestedConvert) editor.convertActiveLayer(options);
      else
        editor.addLayer({
          ...options,
          name: name.trim() || "Tilemap",
          tilesetId: chosen?.id,
        });
      if (source !== (properties ? String(initialSet?.id ?? "new") : "new")) editor.selectTile(0);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create Tilemap");
    }
  };
  useEffect(() => {
    initializeFocus(host.current, { selectText: !convert || properties });
  }, [convert, properties, initializeFocus]);
  if (!sceneRoot) return null;
  const windowWidth = advanced ? 536 : 500,
    windowHeight = convert ? (advanced ? 300 : 230) : advanced ? 336 : 266;
  const bounds = {
    x: Math.round((scene.width - 500) / 2),
    y: Math.round((scene.height - (convert ? 228 : 264)) / 2) - 1,
    width: windowWidth,
    height: windowHeight,
  };
  const rowShift = convert && !properties ? -36 : 0;
  return createPortal(
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          isImeKeyboardEvent(event.nativeEvent) ||
          isDialogPopupTarget(host.current, event.target)
        )
          return;
        if (
          event.key === "Enter" &&
          !(event.target instanceof HTMLElement && event.target.getAttribute("role") === "combobox")
        ) {
          event.preventDefault();
          accept();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "Tab") {
          const nodes = [
            ...(host.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),[role="combobox"]',
            ) ?? []),
          ];
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          if (
            nodes.length &&
            (index < 0 || (event.shiftKey ? index === 0 : index === nodes.length - 1))
          ) {
            event.preventDefault();
            nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
          }
        }
      }}
    >
      <EditorDialog
        open
        modal
        bounds={bounds}
        constrainToViewport
        resizable={false}
        title={convert ? "Tileset" : "New Layer"}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        titlebarActions={({ bounds: b }) => (
          <Button
            bounds={{ x: b.x + b.width - 44, y: b.y + 6, width: 18, height: 22 }}
            relativeTo={b}
            part="window_button_normal"
            hotPart="window_button_hot"
            pushedPart="window_button_selected"
            icon="window_help_icon"
            insetContent={false}
            aria-label="Tilemap help"
            onClick={() =>
              window.open("https://www.aseprite.org/docs/tilemap/", "_blank", "noopener")
            }
          />
        )}
      >
        {({ clientBounds: c }) => (
          <>
            {!convert && (
              <>
                <Label
                  bounds={{ x: c.x, y: c.y + 1, width: 70, height: 24 }}
                  relativeTo={c}
                  text="Name:"
                />
                <Input
                  aria-label="Tilemap name"
                  bounds={{ x: c.x + 72, y: c.y, width: c.width - 72, height: 30 }}
                  relativeTo={c}
                  value={name}
                  onValueChange={setName}
                  textInset={6}
                />
              </>
            )}
            {!convert && (
              <Label
                bounds={{ x: c.x, y: c.y + 39, width: 70, height: 24 }}
                relativeTo={c}
                text="Tileset:"
              />
            )}
            <Combobox
              aria-label="Tileset source"
              bounds={{
                x: c.x + (convert ? 0 : 72),
                y: c.y + 38 + rowShift,
                width: c.width - (convert ? 0 : 72),
                height: 32,
              }}
              relativeTo={c}
              value={source}
              onValueChange={(value) => {
                setSource(value);
                const selected = tilesets.find((set) => String(set.id) === value);
                if (selected) {
                  setTilesetName(selected.name);
                  setBaseIndex(String(selected.baseIndex));
                  setMatchFlags(selected.flags & 0x38);
                } else {
                  setTilesetName("");
                  setBaseIndex("1");
                  setMatchFlags(0);
                }
              }}
              disabled={requestedConvert}
              options={[
                ...(properties ? [] : [{ value: "new", label: "New Tileset" }]),
                ...(requestedConvert
                  ? []
                  : tilesets.map((set, i) => ({
                      value: String(set.id),
                      label: tUi("ui.tileset.x", {
                        value1: i,
                        value2: set.tileWidth,
                        value3: set.tileHeight,
                        value4: set.name,
                      }),
                    }))),
              ]}
            />
            <Label
              bounds={{
                x: c.x + (convert ? 0 : 72),
                y: c.y + 78 + rowShift,
                width: 94,
                height: 24,
              }}
              relativeTo={c}
              text="Name:"
            />
            <Input
              aria-label="Tileset name"
              bounds={{
                x: c.x + (convert ? 101 : 173),
                y: c.y + 78 + rowShift,
                width: c.width - (convert ? 101 : 173) - (properties ? 30 : 0),
                height: 30,
              }}
              relativeTo={c}
              value={properties ? tilesetName : (chosen?.name ?? tilesetName)}
              onValueChange={setTilesetName}
              disabled={!!chosen && !properties}
            />
            <>
              <Label
                bounds={{
                  x: c.x + (convert ? 0 : 72),
                  y: c.y + 116 + rowShift,
                  width: 104,
                  height: 24,
                }}
                relativeTo={c}
                text="Grid Width:"
              />
              <Input
                aria-label="Grid Width"
                bounds={{
                  x: c.x + (convert ? 101 : 173),
                  y: c.y + 116 + rowShift,
                  width: 90,
                  height: 30,
                }}
                relativeTo={c}
                value={chosen ? String(chosen.tileWidth) : width}
                onValueChange={setWidth}
                disabled={!!chosen}
              />
              <Label
                bounds={{
                  x: c.x + (convert ? 276 : 280),
                  y: c.y + 116 + rowShift,
                  width: 108,
                  height: 24,
                }}
                relativeTo={c}
                text="Grid Height:"
              />
              <Input
                aria-label="Grid Height"
                bounds={{ x: c.x + c.width - 95, y: c.y + 116 + rowShift, width: 95, height: 30 }}
                relativeTo={c}
                value={chosen ? String(chosen.tileHeight) : height}
                onValueChange={setHeight}
                disabled={!!chosen}
              />
            </>
            {advanced && (
              <>
                <Label
                  bounds={{
                    x: c.x + (convert ? 0 : 72),
                    y: c.y + 146 + rowShift,
                    width: 104,
                    height: 24,
                  }}
                  relativeTo={c}
                  text="Base Index:"
                />
                <Input
                  aria-label="Base Index"
                  bounds={{
                    x: c.x + (convert ? 104 : 176),
                    y: c.y + 146 + rowShift,
                    width: 88,
                    height: 24,
                  }}
                  relativeTo={c}
                  value={properties ? baseIndex : chosen ? String(chosen.baseIndex) : baseIndex}
                  onValueChange={setBaseIndex}
                />
                <Label
                  bounds={{
                    x: c.x + (convert ? 0 : 72),
                    y: c.y + 180 + rowShift,
                    width: 104,
                    height: 24,
                  }}
                  relativeTo={c}
                  text="Allowed Flips:"
                />
                {(
                  [
                    { label: "X", flag: 8 },
                    { label: "Y", flag: 16 },
                    { label: "D", flag: 32 },
                  ] as const
                ).map((item, i) => (
                  <Button
                    key={item.flag}
                    bounds={{
                      x: c.x + (convert ? 104 : 176) + i * 34,
                      y: c.y + 180 + rowShift,
                      width: 32,
                      height: 26,
                    }}
                    relativeTo={c}
                    text={item.label}
                    selected={!!(matchFlags & item.flag)}
                    selectedPart="buttonset_item_active"
                    aria-label={tUi("ui.allowed.flip", { value1: tUiSource(item.label) })}
                    onClick={() => setMatchFlags((flags) => flags ^ item.flag)}
                  />
                ))}
              </>
            )}
            <Checkbox
              bounds={{
                x: c.x + (convert ? 0 : 72),
                y: c.y + (advanced ? 222 : 155) + rowShift,
                width: 224,
                height: 26,
              }}
              relativeTo={c}
              label="Advanced Options"
              checked={advanced}
              onCheckedChange={setAdvanced}
            />
            {(!valid || error) && (
              <Label
                bounds={{
                  x: c.x + 72,
                  y: c.y + (advanced ? 238 : 168) + rowShift,
                  width: 300,
                  height: 22,
                }}
                relativeTo={c}
                text={error || "Invalid Tileset size or base index"}
              />
            )}
            <Button
              bounds={{
                x: c.x + c.width - 246,
                y: c.y + (advanced ? UINT8_MAX : 186) + rowShift,
                width: 118,
                height: 34,
              }}
              relativeTo={c}
              text="OK"
              disabled={!valid}
              onClick={accept}
            />
            <Button
              bounds={{
                x: c.x + c.width - 119,
                y: c.y + (advanced ? UINT8_MAX : 186) + rowShift,
                width: 118,
                height: 34,
              }}
              relativeTo={c}
              text="Cancel"
              onClick={onClose}
            />
          </>
        )}
      </EditorDialog>
    </div>,
    sceneRoot,
  );
}
