import {
  AgentToolName,
  AgentOutput,
  AgentPreviewBackground,
  type AgentToolDefinition,
} from "$/managers/ports/agent-tools";
import { AnimationIntent, BatchEditKind, BATCH_EDIT_LIMITS } from "@xprite/editor-core";

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
const hexColor = { type: "string", pattern: "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$" };
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
    operation(
      BatchEditKind.Polygon,
      {
        ...paint,
        points: { type: "array", items: point, minItems: 3, maxItems: BATCH_EDIT_LIMITS.points },
      },
      [...paintedRequired, "points"],
    ),
    operation(
      BatchEditKind.FillPolygon,
      {
        ...target,
        color,
        outlineColor: color,
        points: { type: "array", items: point, minItems: 3, maxItems: BATCH_EDIT_LIMITS.points },
      },
      [...paintedRequired, "points"],
    ),
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
    operation(
      BatchEditKind.Grid,
      {
        ...target,
        rect,
        legend: {
          type: "object",
          propertyNames: { minLength: 1, maxLength: 1, pattern: "^[^.]$" },
          additionalProperties: color,
        },
        rows: { type: "array", items: { type: "string" }, minItems: 1 },
        transparent: { type: "string", enum: ["erase", "skip"] },
      },
      ["layerId", "frameIndex", "rect", "legend", "rows"],
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
      {
        frameIndex: integer,
        duration: { type: "integer", minimum: 1, maximum: 65535 },
        durations: {
          type: "array",
          items: { type: "integer", minimum: 1, maximum: 65535 },
          minItems: 1,
        },
      },
      [],
    ),
    operation(
      BatchEditKind.AddTag,
      {
        name: { type: "string", minLength: 1, maxLength: 256 },
        from: integer,
        to: integer,
        direction: {
          type: "string",
          enum: ["forward", "reverse", "ping-pong", "ping-pong-reverse"],
        },
        repeat: { type: "integer", minimum: 0, maximum: 65535 },
        color: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 255 },
          minItems: 3,
          maxItems: 4,
        },
      },
      ["name", "from", "to"],
    ),
    operation(
      BatchEditKind.UpdateTag,
      {
        tagIndex: integer,
        name: { type: "string", minLength: 1, maxLength: 256 },
        from: integer,
        to: integer,
        direction: {
          type: "string",
          enum: ["forward", "reverse", "ping-pong", "ping-pong-reverse"],
        },
        repeat: { type: "integer", minimum: 0, maximum: 65535 },
        color: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 255 },
          minItems: 3,
          maxItems: 4,
        },
      },
      ["tagIndex"],
    ),
    operation(BatchEditKind.RemoveTag, { tagIndex: integer }, ["tagIndex"]),
    operation(
      BatchEditKind.LinkCels,
      {
        layerId: id,
        frameIndices: {
          type: "array",
          items: integer,
          minItems: 2,
        },
      },
      ["layerId", "frameIndices"],
    ),
    operation(
      BatchEditKind.UnlinkCels,
      {
        layerId: id,
        frameIndices: { type: "array", items: integer, minItems: 1 },
      },
      ["layerId", "frameIndices"],
    ),
    operation(BatchEditKind.Clear, { ...target, rect }, ["layerId", "frameIndex"]),
    operation(BatchEditKind.ClearCel, target, ["layerId", "frameIndex"]),
    operation(BatchEditKind.CopyCel, { ...target, toFrameIndex: integer }, [
      "layerId",
      "frameIndex",
      "toFrameIndex",
    ]),
    operation(
      BatchEditKind.Blit,
      {
        ...target,
        src: object(
          {
            documentId: id,
            layerId: id,
            frameIndex: integer,
            rect,
          },
          ["layerId", "frameIndex", "rect"],
        ),
        dest: {
          type: "object",
          properties: {
            x: { type: "integer" },
            y: { type: "integer" },
          },
          required: ["x", "y"],
          additionalProperties: false,
        },
      },
      ["layerId", "frameIndex", "src", "dest"],
    ),
    operation(BatchEditKind.DeleteFrame, { frameIndex: integer }, ["frameIndex"]),
    operation(BatchEditKind.ReorderFrame, { frameIndex: integer, toIndex: integer }, [
      "frameIndex",
      "toIndex",
    ]),
    operation(BatchEditKind.DeleteLayer, { layerId: id }, ["layerId"]),
    operation(
      BatchEditKind.SetLayer,
      {
        layerId: id,
        opacity: { type: "integer", minimum: 0, maximum: 255 },
        blendMode: {
          type: "string",
          enum: [
            "Normal",
            "Multiply",
            "Screen",
            "Overlay",
            "Darken",
            "Lighten",
            "Color Dodge",
            "Color Burn",
            "Hard Light",
            "Soft Light",
            "Difference",
            "Exclusion",
            "Hue",
            "Saturation",
            "Color",
            "Luminosity",
            "Addition",
            "Subtract",
            "Divide",
          ],
        },
        visible: { type: "boolean" },
        name: id,
        editable: { type: "boolean" },
      },
      ["layerId"],
    ),
    operation(
      BatchEditKind.CopyFrame,
      {
        frameIndex: integer,
        to: { type: "array", items: integer, minItems: 1 },
      },
      ["frameIndex", "to"],
    ),
    operation(BatchEditKind.DuplicateLayer, { layerId: id, name: id, toDocumentId: id }, [
      "layerId",
    ]),
    operation(BatchEditKind.MergeLayer, { layerId: id, targetLayerId: id }, ["layerId"]),
    operation(
      BatchEditKind.GroupLayer,
      { layerIds: { type: "array", items: id, minItems: 1 }, name: id },
      ["layerIds"],
    ),
    operation(BatchEditKind.UngroupLayer, { layerId: id }, ["layerId"]),
    operation(
      BatchEditKind.SetCel,
      {
        ...target,
        position: {
          type: "object",
          properties: {
            x: { type: "integer" },
            y: { type: "integer" },
          },
          required: ["x", "y"],
          additionalProperties: false,
        },
        opacity: { type: "integer", minimum: 0, maximum: 255 },
      },
      ["layerId", "frameIndex"],
    ),
    operation(
      BatchEditKind.ResizeCanvas,
      {
        width: { type: "integer", minimum: 1, maximum: 4096 },
        height: { type: "integer", minimum: 1, maximum: 4096 },
        anchor: {
          type: "string",
          enum: [
            "topLeft",
            "top",
            "topRight",
            "left",
            "center",
            "right",
            "bottomLeft",
            "bottom",
            "bottomRight",
          ],
        },
      },
      ["width", "height"],
    ),
    operation(BatchEditKind.CropToContent, { layerId: id }, []),
    operation(
      BatchEditKind.Select,
      {
        op: { type: "string", enum: ["all", "none", "rect", "ellipse", "color"] },
        rect,
        color,
        mode: { type: "string", enum: ["replace", "add", "subtract", "intersect"] },
        grow: { type: "integer", minimum: 1, maximum: 100 },
        shrink: { type: "integer", minimum: 1, maximum: 100 },
      },
      ["op"],
    ),
    operation(
      BatchEditKind.ReplaceColor,
      {
        ...target,
        rect,
        from: color,
        to: color,
        frameRange: { type: "array", items: integer, minItems: 2, maxItems: 2 },
      },
      ["layerId", "frameIndex", "from", "to"],
    ),
    operation(
      BatchEditKind.Outline,
      {
        ...target,
        rect,
        color,
        position: { type: "string", enum: ["outside", "inside"] },
        size: { type: "integer", minimum: 1, maximum: 16 },
      },
      ["layerId", "frameIndex", "color"],
    ),
    operation(
      BatchEditKind.AdjustHsl,
      {
        ...target,
        rect,
        hue: { type: "number", minimum: -360, maximum: 360 },
        saturation: { type: "number", minimum: -100, maximum: 100 },
        lightness: { type: "number", minimum: -100, maximum: 100 },
      },
      ["layerId", "frameIndex"],
    ),
    operation(
      BatchEditKind.Effect,
      {
        ...target,
        rect,
        effect: {
          oneOf: [
            object(
              {
                kind: { const: "brightness-contrast" },
                brightness: { type: "number", minimum: -100, maximum: 100 },
                contrast: { type: "number", minimum: -100, maximum: 100 },
              },
              ["kind"],
            ),
            object({ kind: { const: "invert" } }, ["kind"]),
            object(
              {
                kind: { const: "median-blur" },
                width: { type: "integer", minimum: 1, maximum: 100 },
                height: { type: "integer", minimum: 1, maximum: 100 },
              },
              ["kind"],
            ),
            object(
              {
                kind: { const: "convolution-matrix" },
                preset: {
                  type: "string",
                  enum: [
                    "identity",
                    "box-blur",
                    "gaussian-blur",
                    "sharpen",
                    "edge-detect",
                    "emboss",
                    "horizontal-edges",
                    "vertical-edges",
                  ],
                },
              },
              ["kind", "preset"],
            ),
            object(
              {
                kind: { const: "color-curve" },
                points: {
                  type: "array",
                  minItems: 1,
                  items: object(
                    {
                      x: { type: "integer", minimum: 0, maximum: 255 },
                      y: { type: "integer", minimum: 0, maximum: 255 },
                    },
                    ["x", "y"],
                  ),
                },
              },
              ["kind", "points"],
            ),
            object(
              {
                kind: { const: "hue-saturation" },
                mode: { type: "string", enum: ["hsv-mul", "hsl-mul", "hsv-add", "hsl-add"] },
                hue: { type: "number", minimum: -360, maximum: 360 },
                saturation: { type: "number", minimum: -100, maximum: 100 },
                lightness: { type: "number", minimum: -100, maximum: 100 },
                alpha: { type: "number", minimum: -100, maximum: 100 },
              },
              ["kind"],
            ),
          ],
        },
      },
      ["layerId", "frameIndex", "effect"],
    ),
    operation(
      BatchEditKind.Gradient,
      {
        ...target,
        rect,
        from: color,
        to: color,
        direction: { type: "string", enum: ["horizontal", "vertical", "radial"] },
        dither: { type: "string", enum: ["none", "bayer2", "bayer4", "bayer8"] },
      },
      ["layerId", "frameIndex", "from", "to"],
    ),
    operation(
      BatchEditKind.Dither,
      {
        ...target,
        rect,
        colorA: color,
        colorB: color,
        pattern: { type: "string", enum: ["bayer2", "bayer4", "bayer8", "checker", "noise"] },
        ratio: { type: "number", minimum: 0, maximum: 1 },
      },
      ["layerId", "frameIndex", "colorA", "colorB", "pattern"],
    ),
    operation(
      BatchEditKind.Flip,
      {
        ...target,
        rect,
        direction: { type: "string", enum: ["horizontal", "vertical"] },
      },
      ["layerId", "frameIndex", "direction"],
    ),
    operation(
      BatchEditKind.Rotate90,
      {
        ...target,
        rect,
        angle: { type: "integer", enum: [90, 180, 270] },
      },
      ["layerId", "frameIndex", "angle"],
    ),
    operation(
      BatchEditKind.Translate,
      {
        ...target,
        rect,
        dx: { type: "integer" },
        dy: { type: "integer" },
      },
      ["layerId", "frameIndex", "dx", "dy"],
    ),
    operation(
      BatchEditKind.ResizeSprite,
      {
        width: { type: "integer", minimum: 1, maximum: 4096 },
        height: { type: "integer", minimum: 1, maximum: 4096 },
        method: { type: "string", enum: ["nearest", "bilinear", "rotsprite"] },
      },
      ["width", "height"],
    ),
    operation(
      BatchEditKind.ConvertToTilemap,
      {
        layerId: id,
        tileWidth: { type: "integer", minimum: 1, maximum: 4096 },
        tileHeight: { type: "integer", minimum: 1, maximum: 4096 },
        name: id,
        tilesetName: id,
        baseIndex: integer,
        matchFlags: integer,
      },
      ["layerId", "tileWidth", "tileHeight"],
    ),
    operation(
      BatchEditKind.StampTiles,
      {
        layerId: id,
        frameIndex: integer,
        cells: {
          type: "array",
          minItems: 1,
          items: object(
            {
              x: { type: "integer" },
              y: { type: "integer" },
              tile: { type: "integer", minimum: 0 },
            },
            ["x", "y", "tile"],
          ),
        },
      },
      ["layerId", "frameIndex", "cells"],
    ),
    operation(
      BatchEditKind.PaintTiles,
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
    operation(
      BatchEditKind.TweenCels,
      {
        layerId: id,
        fromFrame: integer,
        toFrame: integer,
        property: { type: "string", enum: ["position", "opacity", "scale"] },
        from: { oneOf: [{ type: "number" }, point] },
        to: { oneOf: [{ type: "number" }, point] },
        ease: { type: "string", enum: ["linear", "in", "out", "inOut", "pingpong"] },
      },
      ["layerId", "fromFrame", "toFrame", "property", "from", "to"],
    ),
  ],
};

export const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = [
  {
    name: AgentToolName.GetContext,
    readOnly: true,
    description:
      "Read before editing. By default returns detailed activeDocument plus a compact documents inventory. Pass documentId to return only that document as data.document. includePalette and includeInkBounds opt into palette entries and per-layer pixel scans; both default false. Revisions, layers, zero-based frames, tags, selection, tilesets and editing limits remain available. Pixels stay in this browser.",
    inputSchema: object(
      {
        documentId: id,
        includePalette: { type: "boolean" },
        includeInkBounds: { type: "boolean" },
      },
      [],
    ),
  },
  {
    name: AgentToolName.Render,
    readOnly: true,
    description:
      'Review sRGB pixels without changing the document. background is transparent (default), checkerboard, or #RRGGBB. scale enlarges with nearest-neighbor; compareNative shows 1x alongside it. labels draws zero-based frame numbers and durations outside the artwork. filmstrip packs frames into a strip/grid and returns frameRects (including duration and optional nativeRect). animation:true returns a looping GIF with document timing, optionally limited by tag or frameRange. onionSkin ghosts neighboring frames. Choose only one of filmstrip, animation or onionSkin. output:"url" returns a browser-local file URL; default output:"dataUrl" returns inline bytes. Release URLs with releaseArtifact. Review both native size and enlargement; technical validation does not assess visual quality.',
    inputSchema: object(
      {
        ...document,
        frameIndex: integer,
        rect,
        scale: { type: "integer", minimum: 1, maximum: 16 },
        background: {
          anyOf: [
            { type: "string", enum: Object.values(AgentPreviewBackground) },
            { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          ],
        },
        labels: { type: "boolean" },
        compareNative: { type: "boolean" },
        animation: { type: "boolean" },
        tag: id,
        frameRange: { type: "array", items: integer, minItems: 2, maxItems: 2 },
        output: { type: "string", enum: [AgentOutput.DataUrl, AgentOutput.Url] },
        filmstrip: object(
          {
            frames: { type: "array", items: integer, minItems: 1 },
            layout: { type: "string", enum: ["strip", "grid"] },
            scale: { type: "integer", minimum: 1, maximum: 16 },
            labels: { type: "boolean" },
          },
          [],
        ),
        onionSkin: object(
          {
            prev: { type: "integer", minimum: 0, maximum: 64 },
            next: { type: "integer", minimum: 0, maximum: 64 },
            alpha: { type: "number", minimum: 0, maximum: 1 },
            layerId: id,
          },
          [],
        ),
      },
      ["documentId"],
    ),
  },
  {
    name: AgentToolName.ReadPixels,
    readOnly: true,
    description:
      "Read a region as row-major working-space RGBA bytes, as a single-character color legend plus one text row per pixel (format \"grid\": '.' is transparent, characters repeat per color), as a diff between two endpoints (mode \"diff\": 'from' and 'to' are {documentId?, frameIndex?, layerId?} defaulting to the top-level values; returns changedPixels, changedBounds, and with detail:true a character map where '.' is unchanged, '-' erased, other characters the new color), or as color statistics (mode \"stats\": returns colors count, a descending histogram of up to 64 colors, the non-transparent bounds, and offPalette colors outside the document palette). Omit layerId for the visible composite. frameIndex defaults to the active frame. Maximum 65536 pixels per read.",
    inputSchema: object(
      {
        ...document,
        frameIndex: integer,
        layerId: id,
        rect,
        format: { type: "string", enum: ["rgba", "grid"] },
        mode: { type: "string", enum: ["rgba", "grid", "diff", "stats"] },
        detail: { type: "boolean" },
        from: {
          type: "object",
          properties: { documentId: id, frameIndex: integer, layerId: id },
          additionalProperties: false,
        },
        to: {
          type: "object",
          properties: { documentId: id, frameIndex: integer, layerId: id },
          additionalProperties: false,
        },
      },
      ["documentId", "rect"],
    ),
  },
  {
    name: AgentToolName.Validate,
    readOnly: true,
    description:
      "Lint a document against pixel-art rules and report concrete, located problems. checks limits the run to a subset (omit for all): off-palette and near-duplicate colours (palette), orphan pixels (strays), broken outlines (outline), banding, semi-transparent pixels (antialiasing), empty layers (layers), untagged frames and optional character timing review (animation), empty document (export_readiness). strict treats warnings as failures. expect runs independently of checks whenever given: layerFrames maps layerId to zero-based [from,to] frame ranges that must hold ink; mustNotOverlap lists [layerId, layerId] pairs whose opaque pixels must never intersect on a frame. Returns passed, checksRun, counts (errors/warnings/notes), findings categorized as technical or visual_review, and a summary. Isolated pixels and edge heuristics are review suggestions, not certain errors. visualReviewRequired is always true; this is not an artwork quality assessment. animationIntent is unspecified (default), character, ambient or mechanical; only character asks for expressive timing review. Frame indices are zero-based.",
    inputSchema: object(
      {
        ...document,
        checks: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "palette",
              "strays",
              "outline",
              "banding",
              "antialiasing",
              "layers",
              "animation",
              "export_readiness",
            ],
          },
        },
        strict: { type: "boolean" },
        animationIntent: { type: "string", enum: Object.values(AnimationIntent) },
        expect: {
          type: "object",
          properties: {
            layerFrames: {
              type: "object",
              additionalProperties: {
                type: "array",
                items: {
                  type: "array",
                  items: integer,
                  minItems: 2,
                  maxItems: 2,
                },
              },
            },
            mustNotOverlap: {
              type: "array",
              items: {
                type: "array",
                items: id,
                minItems: 2,
                maxItems: 2,
              },
            },
          },
          additionalProperties: false,
        },
      },
      ["documentId"],
    ),
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
    name: AgentToolName.ImportImage,
    readOnly: false,
    description:
      'Decode base64 PNG or GIF bytes and paint them into the document as one undo step. format "auto" (default) sniffs the bytes; a multi-frame GIF writes successive frames, appending new frames only past the timeline end. Without layerId a new layer is created above the active one (newLayer:false paints the active layer instead); with layerId the image composites into that layer\'s cel at frameIndex plus position (sprite coordinates, clipped to the canvas). Transparent source pixels keep existing cel pixels. pixelate runs each decoded frame through the pixelation worker before painting — use it to convert a photo or render to pixel art at the canvas or a target resolution; method is the per-cell resample rule (nearest is crisp, box averages, structure keeps detail), colorPicker picks each cell colour when a grid is recovered, targetWidth/targetHeight sets the pixelated size (defaults to the image aspect at canvas fit), outlineStrength 0-1 darkens edges, removeNoise smooths similar colours. Returns the target layerId, frameIndex, rect, image size and new revision.',
    inputSchema: object(
      {
        ...writeDocument,
        bytes: { type: "string", minLength: 1 },
        format: { type: "string", enum: ["auto", "png", "gif"] },
        layerId: id,
        frameIndex: integer,
        position: {
          type: "object",
          properties: { x: { type: "integer" }, y: { type: "integer" } },
          required: ["x", "y"],
          additionalProperties: false,
        },
        newLayer: { type: "boolean" },
        name: id,
        label: id,
        pixelate: object(
          {
            method: {
              type: "string",
              enum: ["nearest", "box", "most-frequent", "dominant", "structure", "two-stage"],
            },
            colorPicker: {
              type: "string",
              enum: [
                "most-common",
                "average",
                "median",
                "k-means",
                "contrast",
                "nearest",
                "structure",
                "two-stage",
                "dual-rt-two-stage",
              ],
            },
            targetWidth: { type: "integer", minimum: 1 },
            targetHeight: { type: "integer", minimum: 1 },
            outlineStrength: { type: "number", minimum: 0, maximum: 1 },
            removeNoise: { type: "boolean" },
          },
          [],
        ),
      },
      ["documentId", "expectedRevision", "bytes"],
    ),
  },
  {
    name: AgentToolName.ManageDocument,
    readOnly: false,
    description:
      "Save, close or duplicate an open document. save runs the editor save workflow and marks the tab saved. close closes the tab; unsaved changes reject the call unless force:true discards them. duplicate opens a copy as a new unsaved tab and returns its context. open is not supported.",
    inputSchema: object(
      {
        op: { type: "string", enum: ["save", "close", "duplicate", "open"] },
        documentId: id,
        name: id,
        force: { type: "boolean" },
        path: { type: "string" },
      },
      ["op"],
    ),
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
      'Return PNG (one frame), Aseprite (complete project), animated GIF or sprite-sheet PNG as base64 file bytes by default; output:"url" returns a browser-local file URL instead. URLs live until releaseArtifact or editor shutdown, with at most 32 files / 64 MiB retained. Does not download, open a file picker, mark saved or upload. Requires no pending edit. PNG defaults to the active frame. gif encodes every frame, frameRange [from,to], or the named tag\'s range, honoring each frame\'s duration; scale is an integer enlargement. spritesheet packs the same frame selection horizontally (layout "strip", the default) or near-square ("grid") and adds frameRects to the result. tag is a shorthand: {format:"tag", tag:"name"} exports that tag\'s range as a GIF when it has more than one frame, PNG otherwise.',
    inputSchema: object(
      {
        ...document,
        output: { type: "string", enum: [AgentOutput.Base64, AgentOutput.Url] },
        format: { type: "string", enum: ["png", "aseprite", "gif", "spritesheet", "tag"] },
        frameIndex: integer,
        frameRange: { type: "array", items: integer, minItems: 2, maxItems: 2 },
        tag: id,
        scale: { type: "integer", minimum: 1, maximum: 16 },
        layout: { type: "string", enum: ["strip", "grid"] },
      },
      ["documentId", "format"],
    ),
  },
  {
    name: AgentToolName.Palette,
    readOnly: false,
    description:
      'Read and shape the document palette. Ops: "get" returns {colors:[{index,hex,pixels}]} with per-color usage across every frame\'s visible composite. "set" writes colors at startIndex, or replaces the palette wholesale with replace:true; remapArt repaints RGBA image cels to the nearest new color and fails on indexed/grayscale or tilemap documents. "ramp" returns {ramp:[hex]}, a hue-shifted ramp around base (shadows toward blue, highlights toward orange); it does not apply itself — call set to append it. "analyze" returns size, unusedIndices, nearDuplicates (deltaE<3), offPaletteColors, lowestContrastPair and a verdict. "extract" quantizes the visible composite across all frames to maxColors and replaces the palette. "snap" repaints every image cel\'s off-palette pixels to the nearest palette color (CIELAB), preserving alpha — the palette-lock repair; one undoable batch, returns changedRegions. Palette writes are one history entry.',
    inputSchema: object(
      {
        ...document,
        op: { type: "string", enum: ["get", "set", "ramp", "analyze", "extract", "snap"] },
        expectedRevision: integer,
        colors: { type: "array", items: hexColor, minItems: 1, maxItems: 256 },
        startIndex: integer,
        replace: { type: "boolean" },
        remapArt: { type: "boolean" },
        base: hexColor,
        steps: { type: "integer", minimum: 2, maximum: 16 },
        spread: { type: "number", minimum: 0.1, maximum: 1 },
        maxColors: { type: "integer", minimum: 2, maximum: 256 },
      },
      ["documentId", "op"],
    ),
  },
  {
    name: AgentToolName.WritePreview,
    readOnly: false,
    description:
      "Render a document frame or region as PNG and write it into the user-connected preview directory, returning the file name. The user connects the directory once in preferences; until then the tool reports preview_directory_permission_required. frameIndex is zero-based and defaults to the active frame; rect defaults to the whole sprite. filename defaults to a unique name and must be a plain *.png name.",
    inputSchema: object(
      {
        ...document,
        frameIndex: integer,
        rect,
        filename: { type: "string", minLength: 1, maxLength: BATCH_EDIT_LIMITS.nameLength },
      },
      ["documentId"],
    ),
  },
  {
    name: AgentToolName.ListDocs,
    readOnly: true,
    description:
      "List the pixel-art handbook's documents as {id, title} pairs. Call first, then readDoc with a chosen id.",
    inputSchema: object({}),
  },
  {
    name: AgentToolName.ReadDoc,
    readOnly: true,
    description:
      'Read a pixel-art handbook page as markdown. Omit id (or pass "index") for the README index; otherwise pass a document id like "00-core-principles" or "42-walk-and-run" — the leading digit selects the band. Call listDocs for the full catalog.',
    inputSchema: object({
      id: { type: "string", minLength: 1, maxLength: BATCH_EDIT_LIMITS.nameLength },
    }),
  },
  {
    name: AgentToolName.ReleaseArtifact,
    readOnly: true,
    description:
      "Release a browser-local file URL previously returned by render or exportDocument. Returns released:false for an unknown/already released URL. Never revokes URLs owned by other features. URLs are also released when the editor interface shuts down.",
    inputSchema: object({ url: { type: "string", minLength: 1 } }),
  },
];
