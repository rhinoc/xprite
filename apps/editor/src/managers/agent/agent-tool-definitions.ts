import { AgentToolName, type AgentToolDefinition } from "$/managers/ports/agent-tools";
import { BatchEditKind, BATCH_EDIT_LIMITS } from "@xprite/editor-core";

const integer = { type: "integer", minimum: 0 };
const id = { type: "string", minLength: 1, maxLength: BATCH_EDIT_LIMITS.nameLength };
const point = {
  type: "object",
  properties: { x: integer, y: integer },
  required: ["x", "y"],
  additionalProperties: false,
};
const rect = {
  type: "object",
  properties: {
    x: integer,
    y: integer,
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
};
const color = {
  oneOf: [
    { type: "string", pattern: "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$" },
    {
      type: "array",
      items: { type: "integer", minimum: 0, maximum: 255 },
      minItems: 4,
      maxItems: 4,
    },
  ],
};
const target = { layerId: id, frameIndex: integer };
const paint = {
  ...target,
  color,
  size: { type: "integer", minimum: 1, maximum: BATCH_EDIT_LIMITS.brushSize },
};
const document = { documentId: id };
const writeDocument = { ...document, expectedRevision: integer };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const operation = (type: BatchEditKind, properties: Record<string, unknown>, required: string[]) =>
  object({ type: { const: type }, ...properties }, ["type", ...required]);
const paintedRequired = ["layerId", "frameIndex", "color"];
const operations = {
  oneOf: [
    operation(
      BatchEditKind.Stroke,
      {
        ...paint,
        points: { type: "array", items: point, minItems: 1, maxItems: BATCH_EDIT_LIMITS.points },
      },
      [...paintedRequired, "points"],
    ),
    operation(BatchEditKind.Line, { ...paint, start: point, end: point }, [
      ...paintedRequired,
      "start",
      "end",
    ]),
    ...[
      BatchEditKind.Rectangle,
      BatchEditKind.FillRect,
      BatchEditKind.Ellipse,
      BatchEditKind.FillEllipse,
    ].map((kind) => operation(kind, { ...paint, rect }, [...paintedRequired, "rect"])),
    operation(BatchEditKind.Fill, { ...paint, point }, [...paintedRequired, "point"]),
    operation(
      BatchEditKind.Pixels,
      {
        ...target,
        rect,
        rgba: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 255 },
          maxItems: BATCH_EDIT_LIMITS.pixels * BATCH_EDIT_LIMITS.rgbaChannels,
        },
      },
      ["layerId", "frameIndex", "rect", "rgba"],
    ),
    operation(BatchEditKind.AddLayer, { layerId: id, name: id, afterLayerId: id }, [
      "layerId",
      "name",
    ]),
    operation(BatchEditKind.RenameLayer, { layerId: id, name: id }, ["layerId", "name"]),
    operation(BatchEditKind.SetLayerVisibility, { layerId: id, visible: { type: "boolean" } }, [
      "layerId",
      "visible",
    ]),
    operation(BatchEditKind.MoveLayer, { layerId: id, targetLayerId: id }, [
      "layerId",
      "targetLayerId",
    ]),
    operation(
      BatchEditKind.AddFrame,
      {
        afterFrameIndex: integer,
        duplicate: { type: "boolean" },
        duration: { type: "integer", minimum: 1, maximum: 65535 },
      },
      ["afterFrameIndex"],
    ),
    operation(
      BatchEditKind.SetFrameDuration,
      { frameIndex: integer, duration: { type: "integer", minimum: 1, maximum: 65535 } },
      ["frameIndex", "duration"],
    ),
  ],
};

export const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = [
  {
    name: AgentToolName.GetContext,
    readOnly: true,
    description:
      "Read Xprite's open documents, active document, content revisions, layers, zero-based frames, selection, palette and editing limits. Read before editing; document pixels remain in this browser.",
    inputSchema: object({}),
  },
  {
    name: AgentToolName.Render,
    readOnly: true,
    description:
      "Render a document frame or region as an sRGB PNG data URL, independent of viewport zoom. frameIndex is zero-based and defaults to the active frame; rect defaults to the whole sprite.",
    inputSchema: object({ ...document, frameIndex: integer, rect }, ["documentId"]),
  },
  {
    name: AgentToolName.ReadPixels,
    readOnly: true,
    description:
      "Read a region of working-space RGBA bytes and the current selection mask in row-major order. Omit layerId for the visible composite. Missing cel pixels are transparent. frameIndex defaults to the active frame. Maximum 65536 pixels per read.",
    inputSchema: object({ ...document, frameIndex: integer, layerId: id, rect }, [
      "documentId",
      "rect",
    ]),
  },
  {
    name: AgentToolName.CreateDocument,
    readOnly: false,
    description:
      "Create and open a new RGBA sprite. Existing documents remain open. Background defaults to transparent. Maximum 2048 pixels per side.",
    inputSchema: object(
      {
        width: { type: "integer", minimum: 1, maximum: 2048 },
        height: { type: "integer", minimum: 1, maximum: 2048 },
        name: id,
        background: { type: "string", enum: ["transparent", "white", "black"] },
      },
      ["width", "height"],
    ),
  },
  {
    name: AgentToolName.ApplyBatch,
    readOnly: false,
    description:
      "Apply 1–128 operations atomically as one undo step to an RGBA document. All coordinates are sprite pixels, all frame indices zero-based. Explicit colors replace RGBA, including transparency; current selection clips painting. Locked, hidden, reference and non-image layers cannot be painted. Linked cels remain linked. moveLayer uses the editor's move-to-target order. addFrame inserts after afterFrameIndex and defaults to duplicating it. Existing active layer/frame and brush settings are preserved. A revision conflict or pending user edit rejects the batch; read context again.",
    inputSchema: object({
      ...writeDocument,
      label: id,
      operations: {
        type: "array",
        items: operations,
        minItems: 1,
        maxItems: BATCH_EDIT_LIMITS.operations,
      },
    }),
  },
  {
    name: AgentToolName.Undo,
    readOnly: false,
    description:
      "Undo the latest history entry in the specified document, including user entries. Requires the current content revision and no pending edit. Returns whether history changed.",
    inputSchema: object(writeDocument),
  },
  {
    name: AgentToolName.Redo,
    readOnly: false,
    description:
      "Redo the next history entry in the specified document. Requires the current content revision and no pending edit. Returns whether history changed.",
    inputSchema: object(writeDocument),
  },
  {
    name: AgentToolName.ExportDocument,
    readOnly: true,
    description:
      "Return PNG (one frame) or Aseprite (complete project) as base64 file bytes. Does not download, open a file picker, mark saved or upload. Requires no pending edit. PNG defaults to the active frame.",
    inputSchema: object(
      { ...document, format: { type: "string", enum: ["png", "aseprite"] }, frameIndex: integer },
      ["documentId", "format"],
    ),
  },
];
