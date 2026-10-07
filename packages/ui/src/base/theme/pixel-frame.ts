/** A nine-slice single-pixel outline with three-pixel stepped corners. */
export function pixelFrameImage(ink: string, face: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9" shape-rendering="crispEdges"><path d="M3 0H6V1H8V3H9V6H8V8H6V9H3V8H1V6H0V3H1V1H3Z" fill="${ink}"/><path d="M3 1H6V2H7V3H8V6H7V7H6V8H3V7H2V6H1V3H2V2H3Z" fill="${face}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Three-pixel default-action ring, with a one-pixel gap around the normal face. */
export function pixelFocusImage(ink: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 15 15" shape-rendering="crispEdges"><path d="M6 0H9V3H6Z M0 6H3V9H0Z M12 6H15V9H12Z M6 12H9V15H6Z M5 0H6V4H4V6H0V5H1V3H2V2H3V1H5Z M9 0H10V1H12V2H13V3H14V5H15V6H11V4H9Z M1 9H0V10H1V12H2V13H3V14H5V15H6V11H4V9Z M11 9H15V10H14V12H13V13H12V14H10V15H9V11H11Z" fill="${ink}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
