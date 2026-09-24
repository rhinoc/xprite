import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type MutableRefObject,
  type RefObject,
} from "react";

type WorkflowHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  "onFocusCapture" | "onPointerDownCapture" | "onPointerMoveCapture" | "onDragOver" | "onDrop"
>;
interface WorkflowBoundary {
  root: RefObject<HTMLElement>;
  handlers: MutableRefObject<WorkflowHandlers | null>;
}
const Context = createContext<WorkflowBoundary | null>(null);
export const EditorWorkflowBoundaryProvider = Context.Provider;

/** Reuse the editor window's native root for workflow capture and file-drop events. */
export function useEditorWorkflowBoundaryHost() {
  const root = useRef<HTMLElement>(null);
  const handlers = useRef<WorkflowHandlers | null>(null);
  const boundary = useMemo(() => ({ root, handlers }), []);
  const props: WorkflowHandlers & { ref: RefObject<HTMLElement> } = {
    ref: root,
    onFocusCapture: (event) => handlers.current?.onFocusCapture?.(event),
    onPointerDownCapture: (event) => handlers.current?.onPointerDownCapture?.(event),
    onPointerMoveCapture: (event) => handlers.current?.onPointerMoveCapture?.(event),
    onDragOver: (event) => handlers.current?.onDragOver?.(event),
    onDrop: (event) => handlers.current?.onDrop?.(event),
  };
  return { boundary, props };
}

export function useEditorWorkflowBoundary() {
  const boundary = useContext(Context);
  if (!boundary) throw new Error("Editor workflows require an editor window boundary");
  return boundary;
}

export function useEditorWorkflowHandlers(handlers: WorkflowHandlers) {
  const boundary = useEditorWorkflowBoundary();
  useLayoutEffect(() => {
    boundary.handlers.current = handlers;
    return () => {
      if (boundary.handlers.current === handlers) boundary.handlers.current = null;
    };
  }, [boundary, handlers]);
}
