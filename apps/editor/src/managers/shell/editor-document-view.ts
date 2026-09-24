import { useCallback, useRef, useSyncExternalStore } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import type { EditorColorProfile } from "$/managers/tools/color-control";
import { workingColorProfile } from "@xprite/editor-core/color";

type EditorColorProfileView = EditorColorProfile;

interface EditorDocumentView {
  id?: number;
  name: string;
  width: number;
  height: number;
  dirty: boolean;
  colorProfile?: EditorColorProfileView;
}

interface EditorDocumentPresentation {
  document: EditorDocumentView | null;
  dirty: boolean;
}
const emptySubscribe = () => () => {};

/** Small presentation snapshot for shell chrome; it does not expose the document model. */
export function useEditorDocumentView() {
  const { core } = useEditorManagerContext();
  const cache = useRef<{
    core: typeof core;
    value: EditorDocumentPresentation;
  } | null>(null);
  const get = useCallback(() => {
    const snapshot = core?.getSnapshot();
    const document = snapshot?.document;
    const dirty = snapshot?.dirty ?? false;
    const profile = workingColorProfile(document?.timeline);
    const previous = cache.current?.core === core ? cache.current.value : null;
    if (previous && previous.dirty === dirty) {
      const old = previous.document;
      if (
        (!old && !document) ||
        (old &&
          document &&
          old.id === document.id &&
          old.name === document.name &&
          old.width === document.width &&
          old.height === document.height &&
          old.colorProfile === profile)
      )
        return previous;
    }
    const value: EditorDocumentPresentation = {
      document: document
        ? {
            id: document.id,
            name: document.name,
            width: document.width,
            height: document.height,
            dirty,
            colorProfile: profile,
          }
        : null,
      dirty,
    };
    cache.current = { core, value };
    return value;
  }, [core]);
  return useSyncExternalStore(core?.subscribe ?? emptySubscribe, get, get);
}
