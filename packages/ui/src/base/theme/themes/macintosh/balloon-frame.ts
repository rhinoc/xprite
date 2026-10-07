/** Shared stepped frame geometry for balloons and content cards. */
function macintoshBalloonSvg(ink: string, face: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 15 15" shape-rendering="crispEdges">
<path d="M7 1H8V7H13V8H8V13H7V8H1V7H7Z" fill="${face}"/>
<path d="M5 0V1H3V2H2V3H1V5H0V7H1V6H2V4H3V3H4V2H6V1H7V0Z M8 1H9V2H11V3H12V5H13V7H15V5H14V3H13V2H12V1H10V0H8Z M1 9V8H0V10H1V12H2V13H3V14H5V15H7V13H5V12H3V11H2V9Z M14 10H15V8H12V10H11V11H10V12H8V15H10V14H12V13H13V12H14Z" fill="${ink}"/>
<path d="M7 1H6V2H4V3H3V4H2V6H1V7H7Z M9 1H8V7H13V5H12V3H11V2H9Z M1 8V9H2V11H3V12H5V13H7V8Z M8 8H12V10H11V11H10V12H8Z" fill="${face}"/>
<path d="M0 7H1V8H0Z M13 7H15V8H13Z M7 0H8V1H7Z M7 13H8V15H7Z" fill="${ink}"/>
</svg>`;
  return svg;
}

export function macintoshBalloonImage(ink: string, face: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(macintoshBalloonSvg(ink, face))}")`;
}
