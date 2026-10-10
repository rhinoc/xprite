import type { DiagnosticRecord } from "$/managers/ports/diagnostics";
import type { TelemetryException } from "$/managers/ports/telemetry";

const MAX_EXCEPTION_MESSAGE_LENGTH = 512;
const MAX_EXCEPTION_STACK_LENGTH = 12_000;
const PRIVATE_FILE_PATTERN =
  /[^\s"'<>/\\]+\.(?:aseprite|ase|png|apng|gif|jpe?g|webp|psd|svg|ora|zip)\b/gi;
const PRIVATE_URL_PATTERN = /(?:file|blob):[^\s)]+/gi;
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#)]+)[?#][^\s)]*/gi;

function scrub(text: string, documentNames: readonly string[]): string {
  let result = text;
  for (const name of documentNames) {
    if (name) result = result.split(name).join("[document]");
  }
  return result
    .replace(PRIVATE_FILE_PATTERN, "[file]")
    .replace(PRIVATE_URL_PATTERN, "[local resource]")
    .replace(URL_QUERY_PATTERN, "$1")
    .replace(/\b[A-Z]:\\[^\s]+|\/(?:Users|home)\/[^\s]+/g, "[local path]");
}

/** Scrub exception text independently from the allowlisted diagnostic metadata. */
export function telemetryException(
  record: DiagnosticRecord,
  documentNames: readonly string[],
): TelemetryException {
  const message = scrub(record.message, documentNames).slice(0, MAX_EXCEPTION_MESSAGE_LENGTH);
  return {
    name: /^[A-Za-z][A-Za-z0-9]*Error$|^Error$/.test(record.name) ? record.name : "Error",
    message,
    ...(record.stack
      ? { stack: scrub(record.stack, documentNames).slice(0, MAX_EXCEPTION_STACK_LENGTH) }
      : {}),
  };
}
