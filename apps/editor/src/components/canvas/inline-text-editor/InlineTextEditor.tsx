import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  clientPoint,
  clientToLocal,
  cn,
  isImeKeyboardEvent,
  usesNativeTextEditing,
} from "@xprite/ui/utils";

import styles from "$/components/canvas/inline-text-editor/inline-text-editor.module.css";

interface InlineTextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InlineTextSelection {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface InlineTextEditorProps {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  /** Projected CSS bounds relative to the overlay host. */
  bounds: InlineTextBounds;
  /** Converts client X into the same logical coordinate space used by caretAt. */
  pixelsToCss: number;
  caretAt: (text: string, logicalX: number) => number;
  onChange: (selection: InlineTextSelection) => void;
  onCommit: () => void;
  onCancel: () => void;
  ariaLabel?: string;
  maxLength?: number;
  onInputElement?: (input: HTMLInputElement | null) => void;
  className?: string;
  style?: CSSProperties;
}

/** Transparent semantic input for text painted by a pixel-art canvas. */
export function InlineTextEditor({
  text,
  selectionStart,
  selectionEnd,
  bounds,
  pixelsToCss,
  caretAt,
  onChange,
  onCommit,
  onCancel,
  ariaLabel = "Text",
  maxLength,
  onInputElement,
  className,
  style,
}: InlineTextEditorProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const anchor = useRef<{ pointerId: number; index: number } | null>(null);
  const composing = useRef(false);
  const [compositionText, setCompositionText] = useState<string | null>(null);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!composing.current) input.current?.setSelectionRange(selectionStart, selectionEnd);
  }, [selectionStart, selectionEnd, text]);

  const publishChange = () => {
    const node = input.current;
    if (composing.current) {
      // Keep React's controlled value in step with the IME without rasterizing
      // unfinished candidates into the editor draft.
      if (node) setCompositionText(node.value);
      return;
    }
    if (node)
      onChange({
        text: node.value,
        selectionStart: node.selectionStart ?? 0,
        selectionEnd: node.selectionEnd ?? 0,
      });
  };

  const getCaret = (clientX: number) => {
    const node = input.current;
    if (!node) return selectionStart;
    const logicalX = clientToLocal(node, { x: clientX, y: 0 }).x / Math.max(0.001, pixelsToCss);
    return caretAt(text, logicalX);
  };

  const inputStyle = {
    "--ui-inline-text-left": `${bounds.x}px`,
    "--ui-inline-text-top": `${bounds.y}px`,
    "--ui-inline-text-width": `${bounds.width}px`,
    "--ui-inline-text-height": `${bounds.height}px`,
    ...style,
  } as CSSProperties;

  return (
    <input
      ref={(node) => {
        input.current = node;
        onInputElement?.(node);
      }}
      aria-label={ariaLabel}
      className={cn(styles.input, className)}
      type="text"
      value={compositionText ?? text}
      maxLength={maxLength}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      style={inputStyle}
      onChange={publishChange}
      onSelect={() => {
        if (anchor.current === null) publishChange();
      }}
      onCompositionStart={(event) => {
        composing.current = true;
        setCompositionText(event.currentTarget.value);
      }}
      onCompositionEnd={() => {
        composing.current = false;
        publishChange();
        setCompositionText(null);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (isImeKeyboardEvent(event.nativeEvent) || composing.current) return;
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (event.button === 2) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          return;
        }
        if (event.button !== 0) return;
        event.stopPropagation();
        // Native pen/touch editing includes iPad handwriting recognition.
        // Capturing these contacts or cancelling their defaults steals it.
        if (usesNativeTextEditing(event)) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        const index = getCaret(clientPoint(event).x);
        anchor.current = {
          pointerId: event.pointerId,
          index: event.shiftKey ? selectionStart : index,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setSelectionRange(
          Math.min(anchor.current.index, index),
          Math.max(anchor.current.index, index),
        );
        publishChange();
      }}
      onPointerMove={(event) => {
        if (anchor.current?.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const index = getCaret(clientPoint(event).x);
        event.currentTarget.setSelectionRange(
          Math.min(anchor.current.index, index),
          Math.max(anchor.current.index, index),
        );
        publishChange();
      }}
      onPointerUp={(event) => {
        if (anchor.current?.pointerId !== event.pointerId) return;
        event.stopPropagation();
        anchor.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (anchor.current?.pointerId === event.pointerId) anchor.current = null;
      }}
      onLostPointerCapture={(event) => {
        if (anchor.current?.pointerId === event.pointerId) anchor.current = null;
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
