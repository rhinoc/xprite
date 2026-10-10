import {
  FileWriteStage,
  PwaDiagnosticStage,
  PwaFailure,
  type DiagnosticRecord,
} from "$/managers/ports/diagnostics";
import type { TelemetryProperties } from "$/managers/ports/telemetry";

enum WorkerState {
  Parsed = "parsed",
  Installing = "installing",
  Installed = "installed",
  Activating = "activating",
  Activated = "activated",
  Redundant = "redundant",
}

enum PermissionState {
  Granted = "granted",
  Denied = "denied",
  Prompt = "prompt",
}

const WORKER_STATES = Object.values(WorkerState);
const PERMISSION_STATES = Object.values(PermissionState);
const PWA_TEXT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  stage: Object.values(PwaDiagnosticStage),
  failure: Object.values(PwaFailure),
  worker_state: WORKER_STATES,
  controller_state: WORKER_STATES,
  active_state: WORKER_STATES,
  installing_state: WORKER_STATES,
  waiting_state: WORKER_STATES,
};
const FILE_WRITE_TEXT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  stage: Object.values(FileWriteStage),
  permission: PERMISSION_STATES,
};
const PWA_BOOLEAN_FIELDS = ["online", "visible", "secure_context", "register_native"];
const FILE_WRITE_BOOLEAN_FIELDS = ["user_activation"];
const PWA_NUMBER_FIELDS = ["timeout_ms", "elapsed_ms", "attempt"];
const FILE_WRITE_NUMBER_FIELDS = ["elapsed_ms"];
const MAX_DIAGNOSTIC_NUMBER = 24 * 60 * 60 * 1000;
const WORKER_VERSION_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function projectDetails(
  value: unknown,
  prefix: string,
  textFields: Readonly<Record<string, readonly string[]>>,
  booleanFields: readonly string[],
  numberFields: readonly string[],
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const details = value as Record<string, unknown>;
  if (typeof details.stage !== "string" || !textFields.stage.includes(details.stage)) return {};
  const properties: Record<string, string | number | boolean | null> = {};
  for (const [key, allowed] of Object.entries(textFields)) {
    const field = details[key];
    if (typeof field === "string" && allowed.includes(field))
      properties[`${prefix}_${key}`] = field;
    else if (field === null) properties[`${prefix}_${key}`] = null;
  }
  for (const key of booleanFields) {
    const field = details[key];
    if (typeof field === "boolean") properties[`${prefix}_${key}`] = field;
  }
  for (const key of numberFields) {
    const field = details[key];
    if (
      typeof field === "number" &&
      Number.isInteger(field) &&
      field >= 0 &&
      field <= MAX_DIAGNOSTIC_NUMBER
    )
      properties[`${prefix}_${key}`] = field;
  }
  return properties;
}

/** Only fixed diagnostic fields cross the telemetry boundary; artwork and arbitrary details stay local. */
export function telemetryDiagnosticDetails(record: DiagnosticRecord): TelemetryProperties {
  const pwa = projectDetails(
    record.details?.pwa,
    "pwa",
    PWA_TEXT_FIELDS,
    PWA_BOOLEAN_FIELDS,
    PWA_NUMBER_FIELDS,
  );
  const version = (record.details?.pwa as Record<string, unknown> | undefined)?.worker_version;
  if (pwa.pwa_stage && typeof version === "string" && WORKER_VERSION_PATTERN.test(version))
    pwa.pwa_worker_version = version;
  return {
    ...pwa,
    ...projectDetails(
      record.details?.fileWrite,
      "file_write",
      FILE_WRITE_TEXT_FIELDS,
      FILE_WRITE_BOOLEAN_FIELDS,
      FILE_WRITE_NUMBER_FIELDS,
    ),
  };
}
