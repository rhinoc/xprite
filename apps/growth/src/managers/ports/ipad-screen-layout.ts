/** Native Xprite screenshots at the film's full iPad display aspect ratio. */
export const SCREEN_WIDTH = 1389;
export const SCREEN_HEIGHT = 970;
const CAPTURE_SIZE = { width: 1389, height: 970 } as const;

/** Native white 128 × 80 sprite at 300% zoom; measured screenshot pixels. */
const CAPTURE_CANVAS = { x: 382, y: 172, width: 768, height: 480 } as const;

/** Full-screen captures retain their aspect ratio and native pixel alignment. */
export const SCREEN_CANVAS = {
  x: (CAPTURE_CANVAS.x / CAPTURE_SIZE.width) * SCREEN_WIDTH,
  y: (CAPTURE_CANVAS.y / CAPTURE_SIZE.height) * SCREEN_HEIGHT,
  width: (CAPTURE_CANVAS.width / CAPTURE_SIZE.width) * SCREEN_WIDTH,
  height: (CAPTURE_CANVAS.height / CAPTURE_SIZE.height) * SCREEN_HEIGHT,
} as const;

export const SCREEN_TARGETS = {
  app: { x: 1956 / 2778, y: 291 / 1940 },
  newSprite: { x: 142 / CAPTURE_SIZE.width, y: 79 / CAPTURE_SIZE.height },
  create: { x: 674 / CAPTURE_SIZE.width, y: 677 / CAPTURE_SIZE.height },
  play: { x: 279.234375 / CAPTURE_SIZE.width, y: 770.1953125 / CAPTURE_SIZE.height },
} as const;
