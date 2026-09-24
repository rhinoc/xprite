/** Parse a single JSON report marker emitted by an Ego nodejs payload. */
export function parseEgoReport({ stdout = "", stderr = "" } = {}, marker) {
  if (!marker || !/^[A-Z][A-Z0-9_]*$/.test(marker))
    throw new TypeError("Ego report marker must be an uppercase token");
  const prefix = `${marker}:`;
  const lines = [String(stdout), String(stderr)].flatMap((stream) => stream.split(/\r?\n/));
  const reportLines = lines.filter((line) => line.startsWith(prefix));
  if (!reportLines.length) throw new Error(`Ego process emitted no ${marker} report.`);
  if (reportLines.length > 1) throw new Error(`Ego process emitted multiple ${marker} reports.`);
  let report;
  try {
    report = JSON.parse(reportLines[0].slice(prefix.length));
  } catch (error) {
    throw new Error(
      `Ego process emitted malformed ${marker} JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    report,
    nonReportLines: lines.filter((line) => line && !line.startsWith(prefix)),
  };
}

/** Print progress/errors while keeping the potentially large JSON report private. */
export function printEgoNonReportLines(
  nonReportLines,
  write = (line) => process.stdout.write(`${line}\n`),
) {
  for (const line of nonReportLines) {
    if (/^[A-Z][A-Z0-9_]*_REPORT:/.test(line)) continue;
    write(line);
  }
}
