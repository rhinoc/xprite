import { useCallback, useRef } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { useInputInteractionMode } from "$/managers/input/input-interaction-context";
import {
  Dialog,
  Popover,
  focusDialogContainer,
  type DialogProps,
  type PopoverProps,
} from "@xprite/ui";

export type { DialogContext, DialogProps } from "@xprite/ui";
export type { PopoverContext, PopoverProps } from "@xprite/ui";

/** Supplies editor scene bounds to generic dialog and popover surfaces. */
export function EditorDialog(props: DialogProps) {
  const sceneBounds = useSceneBounds();
  return <Dialog {...props} sceneBounds={props.sceneBounds ?? sceneBounds} />;
}

export function EditorPopover(props: PopoverProps) {
  const sceneBounds = useSceneBounds();
  return <Popover {...props} sceneBounds={props.sceneBounds ?? sceneBounds} />;
}

interface InitialFocusOptions {
  selector?: string;
  selectText?: boolean;
  typing?: boolean;
}

/** Touch dialogs open for browsing unless entering text is their primary operation. */
export function useEditorDialogInitialFocus() {
  const mode = useInputInteractionMode();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  return useCallback(
    (
      root: HTMLElement | null,
      {
        selector = "input:not(:disabled)",
        selectText = false,
        typing = false,
      }: InitialFocusOptions = {},
    ) => {
      const input = root?.querySelector<HTMLElement>(selector);
      if (!input || (modeRef.current === "touch" && !typing)) {
        focusDialogContainer(root);
        return;
      }
      input.focus({ preventScroll: true });
      if (
        selectText &&
        input instanceof HTMLInputElement &&
        !input.readOnly &&
        input.selectionStart !== null
      )
        input.select();
    },
    [],
  );
}
