enum TextPointerType {
  Touch = "touch",
  Pen = "pen",
}

const PRIMARY_POINTER_BUTTON = 0;

/** Preserve native caret/selection and handwriting on a semantic text input.
 * Mouse interactions may still use custom bitmap caret metrics or popup drags.
 */
export function usesNativeTextEditing(pointer: { pointerType: string; button: number }): boolean {
  return (
    pointer.button === PRIMARY_POINTER_BUTTON &&
    (pointer.pointerType === TextPointerType.Touch || pointer.pointerType === TextPointerType.Pen)
  );
}
