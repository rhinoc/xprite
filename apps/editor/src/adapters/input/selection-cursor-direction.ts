const angleCursors = ["w", "nw", "n", "ne", "e", "se", "s", "sw"] as const;
const handleVectors: Record<string, readonly [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  sw: [-1, 1],
  se: [1, 1],
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

function rotateVector(x: number, y: number, angle: number): readonly [number, number] {
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  return [x * cosine - y * sine, x * sine + y * cosine];
}

function cursorSector(x: number, y: number): number {
  const turns = (((Math.atan2(y, x) / (2 * Math.PI) + 0.5) % 1) + 1) % 1;
  return Math.floor(turns * 8 + 0.5) % 8;
}

/** Choose a cursor sector from the handle's rotated screen-space direction. */
export function selectionCursorDirection(
  handle: string,
  width: number,
  height: number,
  rotation: number,
): (typeof angleCursors)[number] | null {
  const name = handle.startsWith("rotate-") ? handle.slice(7) : handle;
  const direction = handleVectors[name];
  if (!direction || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const [x, y] = rotateVector(direction[0] * (width || 1), direction[1] * (height || 1), rotation);
  return angleCursors[cursorSector(x, y)];
}
