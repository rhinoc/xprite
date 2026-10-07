/** Geometry drawn from the folder tabs and tracks in Apple's Mac OS 8 HIG.
 * These are original scalable drawings, not bundled Apple screenshots or icons. */
function svgImage(width: number, height: number, paths: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges">${paths}</svg>`)}")`;
}

export function folderTabImage(ink: string, face: string, highlight: string, shade: string) {
  const width = 30;
  const height = 22;
  // A one-pixel stepped shoulder and a one-in-three sloping folder edge.
  const left = [12, 10, 9, 8, 8, 7, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2];
  const rows = left
    .map((x, y) => {
      const right = width - x;
      if (y === 0) return `<rect x="${x}" y="${y}" width="${right - x}" height="1" fill="${ink}"/>`;
      return (
        `<rect x="${x}" y="${y}" width="${right - x}" height="1" fill="${face}"/>` +
        `<rect x="${x}" y="${y}" width="1" height="1" fill="${ink}"/>` +
        `<rect x="${x + 1}" y="${y}" width="1" height="1" fill="${highlight}"/>` +
        `<rect x="${right - 2}" y="${y}" width="1" height="1" fill="${shade}"/>` +
        `<rect x="${right - 1}" y="${y}" width="1" height="1" fill="${ink}"/>`
      );
    })
    .join("");
  return svgImage(width, height, rows);
}

export function classicSliderThumbImage(
  ink: string,
  face: string,
  highlight: string,
  shade: string,
) {
  return svgImage(
    13,
    16,
    `<path d="M1 0H12V1H13V10H12V11H11V12H10V13H9V14H8V15H7V16H6V15H5V14H4V13H3V12H2V11H1V10H0V1H1Z" fill="${ink}"/>` +
      `<path d="M1 1H12V10H11V11H10V12H9V13H8V14H7V15H6V14H5V13H4V12H3V11H2V10H1Z" fill="${face}"/>` +
      `<path d="M1 1H12V2H2V10H1Z" fill="${highlight}"/>` +
      `<path d="M11 2H12V10H11V11H10V12H9V13H8V14H7V15H6V14H7V13H8V12H9V11H10V10H11Z" fill="${shade}"/>` +
      `<path d="M4 3H5V9H4Z M6 3H7V9H6Z M8 3H9V9H8Z" fill="${ink}"/>`,
  );
}

export function classicSliderTrackImage(ink: string, face: string) {
  return svgImage(
    9,
    5,
    `<path d="M2 0H7V1H8V2H9V3H8V4H7V5H2V4H1V3H0V2H1V1H2Z" fill="${ink}"/>` +
      `<path d="M2 1H7V2H8V3H7V4H2V3H1V2H2Z" fill="${face}"/>`,
  );
}
