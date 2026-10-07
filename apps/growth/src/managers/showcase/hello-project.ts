import { SCREEN_CANVAS, SCREEN_HEIGHT, SCREEN_WIDTH } from "$/managers/ports/ipad-screen-layout";

export const HELLO_ARTWORK_BOUNDS = {
  x: SCREEN_CANVAS.x / SCREEN_WIDTH,
  y: SCREEN_CANVAS.y / SCREEN_HEIGHT,
  width: SCREEN_CANVAS.width / SCREEN_WIDTH,
  height: SCREEN_CANVAS.height / SCREEN_HEIGHT,
} as const;
