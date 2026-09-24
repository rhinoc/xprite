/** Return keyboard focus to the editor scene after a context-bar option commits. */
export function releaseEditorFocus(element: HTMLElement) {
  element.blur();
  element.closest<HTMLElement>("[data-ui-scene]")?.focus({ preventScroll: true });
}
