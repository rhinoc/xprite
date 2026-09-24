import { useEffect, useRef, useState } from "react";

import { tUi } from "$/i18n";
import { sampledColorInProfile, useColorSources } from "$/managers/colors/color-sources";
import { useScreenColorPicker } from "$/managers/colors/screen-color-picker";
import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import { useEditorFields, useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { ColorSamplingPoint } from "$/managers/ports/color-sampling";
import { useEditorDocumentView } from "$/managers/shell/editor-document-view";
import { rgbaToHex } from "@xprite/editor-core";
import { workingColorProfile } from "@xprite/editor-core/color";

const WORKING_COLOR_SCREEN_PICKER_SCOPE = "working-colors";

/** Color-button picking changes drawing settings even when palette edit mode is enabled. */
export function useWorkingColorDrag() {
  const editor = useEditorFields([
    "foreground",
    "background",
    "backgroundIndex",
    "paletteIndex",
    "colorHover",
    "setNotice",
    "setSampledColor",
  ]);
  const documentView = useEditorDocumentView();
  const { core } = useEditorManagerContext();
  const sources = useColorSources();
  const port = useEditorPlatformPorts()?.colorSampling;
  const dispose = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const screenTarget = useRef(WorkingColorTarget.Foreground);
  const snapshot = core?.getSnapshot();
  const canPickColor = !core || Boolean(documentView.document);
  const screenPicker = useScreenColorPicker(
    canPickColor,
    WORKING_COLOR_SCREEN_PICKER_SCOPE,
    (color) => editor.setSampledColor(screenTarget.current, color),
    workingColorProfile(snapshot?.document?.timeline),
  );
  useEffect(() => {
    if (screenPicker.error) editor.setNotice(screenPicker.error);
  }, [screenPicker.error, editor.setNotice]);
  useEffect(
    () => () => {
      dispose.current?.();
      dispose.current = null;
    },
    [core, port, sources],
  );
  return {
    dragging,
    screenAvailable: canPickColor && screenPicker.available,
    pickScreen(target: WorkingColorTarget) {
      if (!canPickColor || screenPicker.busy) return;
      if (!screenPicker.available) {
        editor.setNotice(tUi("ui.screen.color.unavailable"));
        return;
      }
      dispose.current?.();
      screenTarget.current = target;
      // The click handler must reach the browser picker before yielding user activation.
      void screenPicker.pick();
    },
    start(target: WorkingColorTarget, element: HTMLElement, pointerId: number, screenPick = false) {
      dispose.current?.();
      setDragging(false);
      suppressClick.current = false;
      if (screenPick) return;
      if (!port || !sources) return;
      const snapshot = core?.getSnapshot();
      if (core && !snapshot?.document) return;
      const originalColor = snapshot ? rgbaToHex(snapshot.settings[target]) : editor[target];
      const indexKey =
        target === WorkingColorTarget.Foreground ? "foregroundIndex" : "backgroundIndex";
      const originalIndex = snapshot
        ? snapshot.settings[indexKey]
        : target === WorkingColorTarget.Foreground
          ? editor.paletteIndex
          : editor.backgroundIndex;
      const profile = workingColorProfile(snapshot?.document?.timeline);
      let leftButton = false;
      const apply = (color: string, index: number | null | undefined) => {
        editor.setSampledColor(target, color, index);
        editor.colorHover.set({ hex: color });
      };
      const update = (point: ColorSamplingPoint) => {
        const hit = port.hitTest(point);
        if (hit && element.contains(hit)) {
          if (leftButton) apply(originalColor, originalIndex);
          return;
        }
        if (!leftButton) setDragging(true);
        leftButton = true;
        const sample = sources.sample(point, hit);
        if (sample) apply(sampledColorInProfile(sample, profile), sample.paletteIndex);
      };
      dispose.current = port.captureDrag(element, pointerId, {
        move: update,
        finish(point) {
          update(point);
          suppressClick.current = leftButton;
          dispose.current = null;
          setDragging(false);
          editor.colorHover.set(null);
        },
        cancel() {
          if (leftButton) apply(originalColor, originalIndex);
          suppressClick.current = true;
          dispose.current = null;
          setDragging(false);
          editor.colorHover.set(null);
        },
      });
    },
    shouldOpenPopup(keyboard: boolean) {
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return keyboard || !suppressed;
    },
  };
}
