import { InlineTextEditor } from "$/components/canvas/inline-text-editor/InlineTextEditor";
import { inlineTextCaretAt, type InlineTextDraft } from "$/managers/canvas/canvas-presentation";

export interface EditorInlineTextEditorProps {
  draft: InlineTextDraft;
  bounds: { x: number; y: number; width: number; height: number };
  pixelsToCss: number;
  onChange: (text: string, selectionStart: number, selectionEnd: number) => void;
  onCommit: () => void;
  onCancel: () => void;
  onInputElement?: (input: HTMLInputElement | null) => void;
  className?: string;
}

/** Adapts the editor text draft and bitmap caret metrics to the reusable input. */
export function EditorInlineTextEditor({
  draft,
  bounds,
  pixelsToCss,
  onChange,
  onCommit,
  onCancel,
  onInputElement,
  className,
}: EditorInlineTextEditorProps) {
  return (
    <InlineTextEditor
      text={draft.text}
      selectionStart={draft.selectionStart}
      selectionEnd={draft.selectionEnd}
      bounds={bounds}
      pixelsToCss={pixelsToCss}
      caretAt={(_, logicalX) => inlineTextCaretAt(draft, logicalX)}
      onChange={({ text, selectionStart, selectionEnd }) =>
        onChange(text, selectionStart, selectionEnd)
      }
      onCommit={onCommit}
      onCancel={onCancel}
      ariaLabel="Canvas text"
      maxLength={4096}
      onInputElement={onInputElement}
      className={className}
    />
  );
}
