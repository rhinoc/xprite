const CONTROL =
  'input, textarea, select, button, a[href], [role="slider"], [role="tab"], [tabindex]';
const FIELD_CONTROL =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), button:not([disabled])';

/**
 * A tap on a form row's label or padding acts on the row's control, as a `<label>` would: number
 * fields take focus, buttons and selects activate. Mouse clicks keep the desktop behaviour.
 */
export function forwardFieldTaps() {
  let touch = false;
  document.addEventListener(
    "pointerdown",
    (event) => (touch = event.pointerType === "touch"),
    true,
  );
  document.addEventListener("click", (event) => {
    if (!touch || event.defaultPrevented || !(event.target instanceof Element)) return;
    if (event.target.closest(CONTROL)) return;
    const field = event.target.closest('[data-slot="field"]');
    const control = field?.querySelector<HTMLElement>(FIELD_CONTROL);
    if (!control) return;
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)
      control.focus();
    else control.click();
  });
}
