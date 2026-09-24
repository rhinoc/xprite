/** CSS-pixel motion/timing shared by move and release events. */
export interface TouchContact {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startedAt: number;
  moved: boolean;
}
export function createTouchContact(x: number, y: number, startedAt: number): TouchContact {
  return { x, y, startX: x, startY: y, startedAt, moved: false };
}
export function updateTouchContact(contact: TouchContact, x: number, y: number, slop: number) {
  contact.x = x;
  contact.y = y;
  contact.moved ||= Math.hypot(x - contact.startX, y - contact.startY) > slop;
}
export function touchTapStart(contacts: Iterable<TouchContact>) {
  return Math.min(...Array.from(contacts, (contact) => contact.startedAt));
}
export function isTouchTap(
  startedAt: number,
  endedAt: number,
  moved: boolean,
  maxDuration: number,
) {
  return !moved && endedAt - startedAt <= maxDuration;
}
